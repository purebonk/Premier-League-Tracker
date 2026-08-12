import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { matches, teams } from "@/db/schema";

/**
 * Every read in here hits our own Postgres. Nothing on this path talks to
 * ESPN -- only /api/ingest does.
 */

const home = alias(teams, "home");
const away = alias(teams, "away");

function baseQuery() {
  return db
    .select({
      id: matches.id,
      kicksOffAt: matches.kicksOffAt,
      status: matches.status,
      season: matches.season,
      matchweek: matches.matchweek,
      homeGoals: matches.homeGoals,
      awayGoals: matches.awayGoals,
      minute: matches.minute,
      stoppageMinute: matches.stoppageMinute,
      homeName: home.shortName,
      homeCrest: home.crestUrl,
      awayName: away.shortName,
      awayCrest: away.crestUrl,
    })
    .from(matches)
    .innerJoin(home, eq(matches.homeTeamId, home.id))
    .innerJoin(away, eq(matches.awayTeamId, away.id));
}

/** Most recently completed matches, newest first. */
export function recentResults(limit = 10, competition = "eng.1") {
  return baseQuery()
    .where(and(eq(matches.competition, competition), eq(matches.status, "finished")))
    .orderBy(desc(matches.kicksOffAt))
    .limit(limit);
}

/** Next matches still to be played, soonest first. */
export function upcomingFixtures(limit = 10, competition = "eng.1") {
  return baseQuery()
    .where(
      and(
        eq(matches.competition, competition),
        inArray(matches.status, ["scheduled", "live"]),
      ),
    )
    .orderBy(asc(matches.kicksOffAt))
    .limit(limit);
}

// Derived from the query itself rather than hand-written, so the row type can
// never drift from the columns actually selected (including their nullability).
export type MatchRow = Awaited<ReturnType<typeof recentResults>>[number];
