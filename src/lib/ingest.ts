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
  skipped: Array<{ externalId: string | null; reason: string }>;
  durationMs: number;
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

/**
 * Upsert one match. Kept per-row deliberately: a single malformed record
 * (an unknown club, a null kickoff) must not abort the whole run.
 */
async function upsertMatch(
  m: NormalizedMatch,
  teamIds: Map<string, number>,
): Promise<void> {
  const homeTeamId = teamIds.get(m.home.externalId);
  const awayTeamId = teamIds.get(m.away.externalId);
  if (!homeTeamId || !awayTeamId) {
    throw new Error(
      `unresolved club (home=${m.home.externalId} away=${m.away.externalId})`,
    );
  }

  await db
    .insert(matches)
    .values({
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
    })
    .onConflictDoUpdate({
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
    });
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

  let matchesUpserted = 0;
  for (const m of normalized) {
    try {
      await upsertMatch(m, teamIds);
      matchesUpserted++;
    } catch (err) {
      skipped.push({
        externalId: m.externalId,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    window: dates,
    fetched: events.length,
    teamsUpserted: teamIds.size,
    matchesUpserted,
    skipped,
    durationMs: Date.now() - startedAt,
  };
}

/** Ingest an entire season (Jul..Jun). Used for the 2025/26 backfill. */
export function ingestSeason(seasonStartYear: number): Promise<IngestResult> {
  return ingestWindow(seasonDateRange(seasonStartYear));
}
