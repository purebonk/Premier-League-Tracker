/**
 * Verifies the two properties the matchweek derivation is supposed to give us.
 * If either ever fails, the "table as of matchweek N" query is silently wrong.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  // Property 1: a club's matchweek labels must be non-decreasing along its own
  // fixtures in kickoff order. If they ever decrease, `matchweek <= N` stops
  // selecting a contiguous prefix of that club's season.
  const nonMonotonic = await sql`
    with club_matches as (
      select d.season, c.team_id, d.matchweek,
             row_number() over (partition by d.season, c.team_id
                                order by m.kicks_off_at, m.id) as nth
      from derived_matchweeks d
      join matches m on m.id = d.id
      cross join lateral (values (m.home_team_id), (m.away_team_id)) as c(team_id)
    )
    select count(*)::int as violations from (
      select matchweek,
             lag(matchweek) over (partition by season, team_id order by nth) as prev
      from club_matches
    ) s where prev is not null and matchweek < prev
  `;

  // Property 2: at any matchweek N, no club may have played more than N games.
  const overplayed = await sql`
    with played as (
      select d.season, d.matchweek, c.team_id
      from derived_matchweeks d
      join matches m on m.id = d.id
      cross join lateral (values (m.home_team_id), (m.away_team_id)) as c(team_id)
    ),
    cumulative as (
      select season, team_id, matchweek,
             count(*) over (partition by season, team_id
                            order by matchweek
                            rows between unbounded preceding and current row) as games
      from played
    )
    select count(*)::int as violations from cumulative where games > matchweek
  `;

  // Sanity: every club must play exactly 38 league matches in a full season.
  const perClub = await sql`
    select season, min(games)::int as min_games, max(games)::int as max_games,
           count(*)::int as clubs
    from (
      select d.season, c.team_id, count(*)::int as games
      from derived_matchweeks d
      join matches m on m.id = d.id
      cross join lateral (values (m.home_team_id), (m.away_team_id)) as c(team_id)
      group by d.season, c.team_id
    ) s group by season order by season
  `;

  console.log("Property 1 - labels non-decreasing per club (prefix holds):");
  console.table(nonMonotonic);
  console.log("Property 2 - no club exceeds N games at matchweek N:");
  console.table(overplayed);
  console.log("Sanity - games per club per season:");
  console.table(perClub);

  const failed =
    Number(nonMonotonic[0].violations) > 0 || Number(overplayed[0].violations) > 0;
  console.log(failed ? "\nFAILED" : "\nBoth guarantees hold.");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
