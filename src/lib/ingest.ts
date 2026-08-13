import { sql } from "drizzle-orm";
import { db } from "@/db";
import { teams, matches } from "@/db/schema";
import { fetchScoreboard, seasonDateRange } from "./espn";
import { normalizeEvent, type NormalizedMatch, type NormalizedTeam } from "./normalize";

export interface IngestResult {
  window: string;
  fetched: number;
  teamsUpserted: number;
  matchesUpserted: number;
  matchweeksUpdated: number;
  skipped: Array<{ externalId: string | null; reason: string }>;
  durationMs: number;
}

/**
 * Materialise derived matchweeks into matches.matchweek.
 *
 * The `derived_matchweeks` view is the single definition of the rule; this
 * column is its cache, so reads can filter and index on matchweek without
 * recomputing two window functions every time.
 *
 * It must run after every ingest, not just after a backfill: a rearranged
 * fixture moving to a later kickoff shifts both clubs' match counts, which
 * can renumber matches that were already stored. Restricting the write to
 * rows that actually changed (`is distinct from`) keeps a no-op run cheap.
 */
async function refreshMatchweeks(): Promise<number> {
  const result = await db.execute(sql`
    with updated as (
      update matches m
      set matchweek = d.matchweek
      from derived_matchweeks d
      where d.id = m.id
        and m.matchweek is distinct from d.matchweek
      returning 1
    )
    select count(*)::int as n from updated
  `);
  const rows = (result as unknown as { rows?: Array<{ n: number }> }).rows ?? result;
  return Number((rows as Array<{ n: number }>)[0]?.n ?? 0);
}

/**
 * Upsert clubs on their ESPN id and return externalId -> our primary key.
 *
 * Idempotency: the natural key is `external_id`, so a re-run updates the
 * existing row instead of inserting a second Arsenal.
 */
async function upsertTeams(
  incoming: NormalizedTeam[],
): Promise<Map<string, number>> {
  const unique = new Map<string, NormalizedTeam>();
  for (const t of incoming) unique.set(t.externalId, t);
  if (unique.size === 0) return new Map();

  const rows = await db
    .insert(teams)
    .values([...unique.values()])
    .onConflictDoUpdate({
      target: teams.externalId,
      set: {
        name: sql`excluded.name`,
        shortName: sql`excluded.short_name`,
        crestUrl: sql`excluded.crest_url`,
      },
    })
    .returning({ id: teams.id, externalId: teams.externalId });

  return new Map(rows.map((r) => [r.externalId, r.id]));
}

type MatchRow = typeof matches.$inferInsert;

/** Resolve FKs; throws for a match referencing a club we failed to upsert. */
function toRow(m: NormalizedMatch, teamIds: Map<string, number>): MatchRow {
  const homeTeamId = teamIds.get(m.home.externalId);
  const awayTeamId = teamIds.get(m.away.externalId);
  if (!homeTeamId || !awayTeamId) {
    throw new Error(
      `unresolved club (home=${m.home.externalId} away=${m.away.externalId})`,
    );
  }
  return {
    externalId: m.externalId,
    competition: m.competition,
    season: m.season,
    kicksOffAt: m.kicksOffAt,
    status: m.status,
    homeTeamId,
    awayTeamId,
    homeGoals: m.homeGoals,
    awayGoals: m.awayGoals,
    minute: m.minute,
    stoppageMinute: m.stoppageMinute,
  };
}

const MATCH_CONFLICT_UPDATE = {
  target: matches.externalId,
  set: {
    competition: sql`excluded.competition`,
    season: sql`excluded.season`,
    kicksOffAt: sql`excluded.kicks_off_at`,
    status: sql`excluded.status`,
    homeTeamId: sql`excluded.home_team_id`,
    awayTeamId: sql`excluded.away_team_id`,
    homeGoals: sql`excluded.home_goals`,
    awayGoals: sql`excluded.away_goals`,
    minute: sql`excluded.minute`,
    stoppageMinute: sql`excluded.stoppage_minute`,
    updatedAt: sql`now()`,
  },
} as const;

const CHUNK_SIZE = 100;

/**
 * Upsert matches in chunks, falling back to per-row on failure.
 *
 * One row per round trip is far too slow to survive a serverless function
 * timeout -- a 380-match season backfill took ~34s sequentially. Batching
 * collapses that into a handful of multi-row INSERTs.
 *
 * Batching alone would sacrifice the "one bad record must not kill the run"
 * guarantee, since a single bad row fails its whole chunk. So a failed chunk
 * is retried row by row: the good rows still land and only the genuinely bad
 * ones are reported as skipped. Fast path stays fast, bad data stays isolated.
 */
async function upsertMatches(
  rows: MatchRow[],
  skipped: IngestResult["skipped"],
): Promise<number> {
  let upserted = 0;

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    try {
      await db.insert(matches).values(chunk).onConflictDoUpdate(MATCH_CONFLICT_UPDATE);
      upserted += chunk.length;
    } catch {
      for (const row of chunk) {
        try {
          await db.insert(matches).values(row).onConflictDoUpdate(MATCH_CONFLICT_UPDATE);
          upserted++;
        } catch (err) {
          skipped.push({
            externalId: row.externalId,
            reason: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  }

  return upserted;
}

/**
 * Ingest one date window. `dates` is ESPN's format: "YYYYMMDD" or a range.
 *
 * Fails partially, not totally: every skipped record is logged with a reason
 * and returned in the result, and the run still reports success.
 */
export async function ingestWindow(dates: string): Promise<IngestResult> {
  const startedAt = Date.now();
  const events = await fetchScoreboard(dates);

  const normalized: NormalizedMatch[] = [];
  const skipped: IngestResult["skipped"] = [];

  for (const event of events) {
    const m = normalizeEvent(event);
    if (m) normalized.push(m);
    else skipped.push({ externalId: event?.id ?? null, reason: "unparseable event" });
  }

  const teamIds = await upsertTeams(
    normalized.flatMap((m) => [m.home, m.away]),
  );

  const rows: MatchRow[] = [];
  for (const m of normalized) {
    try {
      rows.push(toRow(m, teamIds));
    } catch (err) {
      skipped.push({
        externalId: m.externalId,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const matchesUpserted = await upsertMatches(rows, skipped);
  const matchweeksUpdated = await refreshMatchweeks();

  return {
    window: dates,
    fetched: events.length,
    teamsUpserted: teamIds.size,
    matchesUpserted,
    matchweeksUpdated,
    skipped,
    durationMs: Date.now() - startedAt,
  };
}

/** Ingest an entire season (Jul..Jun). Used for the 2025/26 backfill. */
export function ingestSeason(seasonStartYear: number): Promise<IngestResult> {
  return ingestWindow(seasonDateRange(seasonStartYear));
}
