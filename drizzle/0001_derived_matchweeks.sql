-- Matchweek is not available from the source: ESPN's scoreboard returns
-- week: null on every match. It has to be derived from match history.
--
-- DEFINITION (deliberately NOT the official Premier League matchweek):
--
--   matchweek = N means this match is the point at which the LATER-PLAYING
--   of its two clubs completed its Nth league match of the season.
--
--   Filtering `matchweek <= N` therefore gives "the table once clubs had
--   played N matches each". A club holding a game in hand sits on N-1 played
--   until its rearranged fixture is played.
--
-- HOW THIS DIFFERS FROM THE OFFICIAL TABLE, AND WHY:
--
-- The official matchweek is a fixture-list label fixed before the season. A
-- match postponed from round 27 keeps the label 27 even when it is played in
-- May, so official tables at round 27 show clubs on unequal games played.
--
-- We cannot recover that label -- it is not in the payload at all -- but the
-- games-played ordering is arguably the better axis for tracking position
-- over time: every club's line moves because of results, not because it
-- happened to have played an extra fixture that week. The cost is that our
-- week 27 will not match the official week 27 for clubs with a rearranged
-- fixture, which is stated in the README and surfaced in the UI.
--
-- Observed in 2025/26: Crystal Palace and Spurs each carried a game in hand
-- from week 27, so week 27 holds 9 matches and week 36 holds 11 (Man City v
-- Crystal Palace, played 13 May, lands with the later round rather than the
-- earlier one it was postponed from). 18 club-weeks sit at a lag of one game;
-- the other 742 are exact.
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
