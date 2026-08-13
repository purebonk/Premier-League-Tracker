-- Matchweek is not available from the source: ESPN's scoreboard returns
-- week: null on every match. It has to be derived from match history.
--
-- Rule: a match belongs to the matchweek of the LATER-PLAYING of its two
-- clubs -- i.e. max(home club's Nth match, away club's Nth match).
--
-- A match has two clubs, and once a fixture is rearranged their cumulative
-- counts diverge (18 of 380 matches in 2025/26). Taking the max means a match
-- only enters the table once BOTH clubs have reached that week, so a table
-- "as of matchweek N" can never show a club with more than N games played.
-- Taking the min would admit a match one club has not yet reached.

create or replace view derived_matchweeks as
with club_matches as (
  select
    m.id,
    m.competition,
    m.season,
    c.team_id,
    -- Each match contributes one row per club, so a club's running count is
    -- just a row_number over its own fixtures in kickoff order. id breaks
    -- ties so two matches at an identical kickoff order deterministically.
    row_number() over (
      partition by m.competition, m.season, c.team_id
      order by m.kicks_off_at, m.id
    ) as nth
  from matches m
  -- Fan one match row out into its two participating clubs.
  cross join lateral (values (m.home_team_id), (m.away_team_id)) as c(team_id)
  -- A cancelled match is never played, so it must not consume a slot in
  -- either club's sequence. Postponed matches keep their row and simply move
  -- to a later kickoff, so they are still counted.
  where m.status <> 'cancelled'
)
select
  id,
  competition,
  season,
  max(nth)::int as matchweek
from club_matches
group by id, competition, season;
