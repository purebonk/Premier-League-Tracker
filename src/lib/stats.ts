/**
 * Derived statistics — computed in SQL, not JavaScript.
 *
 * Everything here aggregates over stored match history. None of it is
 * available from the source API, which only knows "now".
 *
 * The queries are plain SQL strings rather than an ORM builder for two
 * reasons: they are the substance of the project and have to be readable as
 * SQL, and keeping them driver-agnostic lets the tests run them against an
 * in-process Postgres with no network and no secrets.
 */

/** Minimal executor so the same SQL runs against Neon and PGlite alike. */
export interface Queryable {
  query<T>(sql: string, params: unknown[]): Promise<T[]>;
}

export const DEFAULT_COMPETITION = "eng.1";
export const FORM_WINDOW = 6;
export const FORM_STRIP = 5;

export type Venue = "all" | "home" | "away";

export type SortColumn =
  | "position"
  | "name"
  | "played"
  | "won"
  | "drawn"
  | "lost"
  | "goalsFor"
  | "goalsAgainst"
  | "goalDifference"
  | "points";

export type SortDirection = "asc" | "desc";

export interface StandingsOptions {
  season: number;
  competition?: string;
  /** Table as of N matches played. Null = the whole season so far. */
  uptoMatch?: number | null;
  /** Restrict the fan-out to one side of the fixture. */
  venue?: Venue;
  /** Only each club's most recent N matches *within the current filter*. */
  lastN?: number | null;
  /** Mini-league: only matches where BOTH clubs are in this set. */
  opponents?: number[];
  sort?: { column: SortColumn; direction: SortDirection };
}

/**
 * ORDER BY cannot be parameterised, so the sort column is resolved through an
 * allowlist and never interpolated from user input. Anything not in this map
 * falls back to the default ordering.
 */
const SORT_COLUMNS: Record<SortColumn, string> = {
  position: "position",
  name: "name",
  played: "played",
  won: "won",
  drawn: "drawn",
  lost: "lost",
  goalsFor: "goals_for",
  goalsAgainst: "goals_against",
  goalDifference: "goal_difference",
  points: "points",
};

/** The canonical league ordering. `position` always reflects this, whatever the display sort. */
const CANONICAL_ORDER = "points desc, goal_difference desc, goals_for desc, name asc";

/**
 * Fans every finished match into one row per club, from that club's point of
 * view, then applies the filter parameters. This is the shared foundation of
 * every standings-shaped query: `matches` stores fixtures, but standings are
 * per club, and a lateral join is what converts between the two.
 *
 * Only finished matches with both scores present contribute. A postponed or
 * scheduled fixture has no result to aggregate, and counting it would inflate
 * `played` for every club involved.
 *
 * Parameters: $1 competition, $2 season, $3 uptoMatch, $4 venue,
 * $5 opponents, $6 lastN.
 *
 * Order of operations matters. Venue, opponent and matchweek filters are
 * predicates on the match, so they apply first; recency is a window over
 * whatever survived, so "last 6 away matches" means the last six of the away
 * matches, not the away subset of the last six overall.
 */
const CLUB_MATCHES = /* sql */ `
  base as (
    select
      m.id,
      m.season,
      m.matchweek,
      m.kicks_off_at,
      c.team_id,
      c.goals_for,
      c.goals_against,
      c.venue,
      case
        when c.goals_for > c.goals_against then 'W'
        when c.goals_for = c.goals_against then 'D'
        else 'L'
      end as outcome
    from matches m
    cross join lateral (values
      (m.home_team_id, m.home_goals, m.away_goals, 'home'::text),
      (m.away_team_id, m.away_goals, m.home_goals, 'away'::text)
    ) as c(team_id, goals_for, goals_against, venue)
    where m.competition = $1
      and m.season = $2
      and m.status = 'finished'
      and m.home_goals is not null
      and m.away_goals is not null
      -- Table as of N matches played.
      and ($3::int is null or m.matchweek <= $3::int)
      -- Keep only one side of the fixture when a venue is requested.
      and ($4::text = 'all' or c.venue = $4::text)
      -- Mini-league: BOTH clubs must be in the set, otherwise a "top six"
      -- table would still include their matches against everyone else.
      and (cardinality($5::int[]) = 0
           or (m.home_team_id = any($5::int[]) and m.away_team_id = any($5::int[])))
  ),
  ranked as (
    select *,
      row_number() over (
        partition by team_id order by kicks_off_at desc, id desc
      ) as recency
    from base
  ),
  club_matches as (
    select * from ranked
    where ($6::int is null or recency <= $6::int)
  )`;

export interface TableRow {
  position: number;
  teamId: number;
  name: string;
  shortName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  /** Last five results within the current filter, most recent first. */
  form: string;
}

/**
 * Standings — the one query behind every table view on the site.
 *
 * The full table, the form table, home-only, away-only and a top-six
 * mini-league are not five queries; they are this query with different
 * predicates. Adding a view should mean adding an option, never adding SQL.
 *
 * Ordering uses full tiebreakers: points, then goal difference, then goals
 * scored, then club name. Three outcomes are counted separately rather than
 * inferred, because `played - won - lost` is only "drawn" in a sport that has
 * draws in the first place, and inferring it hides the assumption.
 *
 * `position` is always the canonical league rank within the current filter,
 * even when the caller sorts by another column. Clicking "GF" should reorder
 * the rows on screen, not renumber the league.
 */
function buildStandingsSql(sort?: { column: SortColumn; direction: SortDirection }): string {
  // ORDER BY cannot be parameterised, so the column is resolved through an
  // allowlist. An unknown column falls back rather than reaching the database.
  const column = SORT_COLUMNS[sort?.column as SortColumn] ?? "position";
  const direction = sort?.direction === "asc" ? "asc" : "desc";
  const resolved = sort ? `${column} ${direction}` : "position asc";

  return /* sql */ `
  with ${CLUB_MATCHES},
  totals as (
    select
      t.id as team_id,
      t.name,
      t.short_name,
      count(*)::int as played,
      count(*) filter (where cm.outcome = 'W')::int as won,
      count(*) filter (where cm.outcome = 'D')::int as drawn,
      count(*) filter (where cm.outcome = 'L')::int as lost,
      coalesce(sum(cm.goals_for), 0)::int as goals_for,
      coalesce(sum(cm.goals_against), 0)::int as goals_against,
      coalesce(sum(cm.goals_for) - sum(cm.goals_against), 0)::int as goal_difference,
      -- Three points for a win, one for a draw. Derived rather than stored so
      -- it cannot drift out of sync with the results it comes from.
      (count(*) filter (where cm.outcome = 'W') * 3
       + count(*) filter (where cm.outcome = 'D'))::int as points,
      -- The W/D/L strip: the last five of whatever this filter selected, so an
      -- away-only table shows the last five away results.
      coalesce(
        string_agg(cm.outcome, ' ' order by cm.recency)
          filter (where cm.recency <= ${FORM_STRIP}),
        ''
      ) as form
    from club_matches cm
    join teams t on t.id = cm.team_id
    group by t.id, t.name, t.short_name
  ),
  ordered as (
    -- A window function cannot see aliases from its own SELECT, so ranking
    -- happens one level above the aggregation.
    select *,
      row_number() over (order by ${CANONICAL_ORDER})::int as position
    from totals
  )
  select * from ordered
  order by ${resolved}, ${CANONICAL_ORDER}
`;
}

export function standings(db: Queryable, opts: StandingsOptions): Promise<TableRow[]> {
  return db
    .query<Record<string, unknown>>(buildStandingsSql(opts.sort), [
      opts.competition ?? DEFAULT_COMPETITION,
      opts.season,
      opts.uptoMatch ?? null,
      opts.venue ?? "all",
      opts.opponents ?? [],
      opts.lastN ?? null,
    ])
    .then((rows) => rows.map(toTableRow));
}

/**
 * Named views, expressed purely as option fragments. These are what the UI
 * offers as one-click presets; none of them is a separate query.
 */
export const PRESETS = {
  full: {},
  form: { lastN: FORM_WINDOW },
  home: { venue: "home" as Venue },
  away: { venue: "away" as Venue },
} satisfies Record<string, Partial<StandingsOptions>>;

export interface StreakRow {
  teamId: number;
  name: string;
  shortName: string;
  played: number;
  /** Consecutive wins, running as of the club's most recent match. */
  winStreak: number;
  /** Consecutive matches without defeat: wins and draws both continue it. */
  unbeatenStreak: number;
  /** Consecutive matches without a win: draws and defeats both continue it. */
  winlessStreak: number;
  /** Consecutive matches without conceding. */
  cleanSheetStreak: number;
}

/**
 * Current streaks, running as of each club's most recent match.
 *
 * Three outcomes make win and unbeaten genuinely different questions, and this
 * is where a two-outcome mental model silently breaks: a draw ends a winning
 * run but extends an unbeaten one, and it extends a winless run without being
 * a defeat. Each streak therefore has its own breaking condition rather than
 * sharing one "did they lose" flag.
 *
 * Implementation: number each club's matches backwards from the most recent
 * (`recency` 1, 2, 3...), then find the recency of the nearest match that
 * breaks the streak. The current streak is that position minus one -- if the
 * nearest defeat is 4 matches back, the club is 3 matches unbeaten. When no
 * breaking match exists the whole history qualifies, hence the coalesce to
 * count + 1.
 *
 * This avoids gaps-and-islands entirely because only the current run is
 * wanted. Longest-run-of-the-season would need the islands form: a group id
 * from a running sum of break flags, then max(count) per group.
 */
const STREAKS_SQL = /* sql */ `
  with ${CLUB_MATCHES},
  recent as (
    -- club_matches already numbers each club's matches backwards as recency.
    select *, (goals_against = 0) as clean_sheet
    from club_matches
  )
  select
    t.id as team_id,
    t.name,
    t.short_name,
    count(*)::int as played,
    (coalesce(min(r.recency) filter (where r.outcome <> 'W'), count(*) + 1) - 1)::int
      as win_streak,
    (coalesce(min(r.recency) filter (where r.outcome = 'L'), count(*) + 1) - 1)::int
      as unbeaten_streak,
    (coalesce(min(r.recency) filter (where r.outcome = 'W'), count(*) + 1) - 1)::int
      as winless_streak,
    (coalesce(min(r.recency) filter (where not r.clean_sheet), count(*) + 1) - 1)::int
      as clean_sheet_streak
  from recent r
  join teams t on t.id = r.team_id
  group by t.id, t.name, t.short_name
  order by t.name
`;

export function streaks(
  db: Queryable,
  opts: { season: number; competition?: string; venue?: Venue; opponents?: number[] },
): Promise<StreakRow[]> {
  return db
    .query<Record<string, unknown>>(STREAKS_SQL, [
      opts.competition ?? DEFAULT_COMPETITION,
      opts.season,
      null,
      opts.venue ?? "all",
      opts.opponents ?? [],
      null,
    ])
    .then((rows) =>
      rows.map((r) => ({
        teamId: Number(r.team_id),
        name: String(r.name),
        shortName: String(r.short_name),
        played: Number(r.played),
        winStreak: Number(r.win_streak),
        unbeatenStreak: Number(r.unbeaten_streak),
        winlessStreak: Number(r.winless_streak),
        cleanSheetStreak: Number(r.clean_sheet_streak),
      })),
    );
}

export interface HeadToHead {
  played: number;
  teamAWins: number;
  draws: number;
  teamBWins: number;
  teamAGoals: number;
  teamBGoals: number;
  meetings: Array<{
    season: number;
    kicksOffAt: Date;
    homeName: string;
    awayName: string;
    homeGoals: number;
    awayGoals: number;
  }>;
}

/**
 * Historical record between two clubs, across every stored season.
 *
 * Deliberately not filtered by season: the whole point of head-to-head is that
 * it reaches back further than the current campaign. Results are normalised to
 * team A's perspective so the caller does not have to work out which side of
 * each fixture their club was on.
 */
const H2H_SUMMARY_SQL = /* sql */ `
  with meetings as (
    select
      m.*,
      case when m.home_team_id = $2::int then m.home_goals else m.away_goals end as a_goals,
      case when m.home_team_id = $2::int then m.away_goals else m.home_goals end as b_goals
    from matches m
    where m.competition = $1
      and m.status = 'finished'
      and m.home_goals is not null
      and m.away_goals is not null
      and ((m.home_team_id = $2::int and m.away_team_id = $3::int)
        or (m.home_team_id = $3::int and m.away_team_id = $2::int))
  )
  select
    count(*)::int as played,
    count(*) filter (where a_goals > b_goals)::int as team_a_wins,
    count(*) filter (where a_goals = b_goals)::int as draws,
    count(*) filter (where a_goals < b_goals)::int as team_b_wins,
    coalesce(sum(a_goals), 0)::int as team_a_goals,
    coalesce(sum(b_goals), 0)::int as team_b_goals
  from meetings
`;

const H2H_MEETINGS_SQL = /* sql */ `
  select
    m.season,
    m.kicks_off_at,
    h.short_name as home_name,
    a.short_name as away_name,
    m.home_goals,
    m.away_goals
  from matches m
  join teams h on h.id = m.home_team_id
  join teams a on a.id = m.away_team_id
  where m.competition = $1
    and m.status = 'finished'
    and m.home_goals is not null
    and m.away_goals is not null
    and ((m.home_team_id = $2::int and m.away_team_id = $3::int)
      or (m.home_team_id = $3::int and m.away_team_id = $2::int))
  order by m.kicks_off_at desc
  limit $4::int
`;

export async function headToHead(
  db: Queryable,
  opts: { teamAId: number; teamBId: number; limit?: number; competition?: string },
): Promise<HeadToHead> {
  const competition = opts.competition ?? DEFAULT_COMPETITION;
  const [summaryRows, meetingRows] = await Promise.all([
    db.query<Record<string, unknown>>(H2H_SUMMARY_SQL, [
      competition,
      opts.teamAId,
      opts.teamBId,
    ]),
    db.query<Record<string, unknown>>(H2H_MEETINGS_SQL, [
      competition,
      opts.teamAId,
      opts.teamBId,
      opts.limit ?? 10,
    ]),
  ]);

  const s = summaryRows[0] ?? {};
  return {
    played: Number(s.played ?? 0),
    teamAWins: Number(s.team_a_wins ?? 0),
    draws: Number(s.draws ?? 0),
    teamBWins: Number(s.team_b_wins ?? 0),
    teamAGoals: Number(s.team_a_goals ?? 0),
    teamBGoals: Number(s.team_b_goals ?? 0),
    meetings: meetingRows.map((r) => ({
      season: Number(r.season),
      kicksOffAt: new Date(r.kicks_off_at as string),
      homeName: String(r.home_name),
      awayName: String(r.away_name),
      homeGoals: Number(r.home_goals),
      awayGoals: Number(r.away_goals),
    })),
  };
}

export interface PositionPoint {
  matchweek: number;
  teamId: number;
  position: number;
  points: number;
  goalDifference: number;
}

/**
 * League position for every club at every matchweek — the series behind the
 * position-over-time chart.
 *
 * Computed as a single cumulative aggregation rather than by running the table
 * query 38 times: a self-join over matchweeks builds each club's running
 * totals, and one window function ranks every club within every week. Doing it
 * per week would be 38 round trips for the same answer.
 */
const POSITION_HISTORY_SQL = /* sql */ `
  with ${CLUB_MATCHES},
  weeks as (
    select generate_series(1, max(matchweek))::int as matchweek
    from club_matches
  ),
  cumulative as (
    select
      w.matchweek,
      cm.team_id,
      (count(*) filter (where cm.outcome = 'W') * 3
       + count(*) filter (where cm.outcome = 'D'))::int as points,
      (sum(cm.goals_for) - sum(cm.goals_against))::int as goal_difference,
      sum(cm.goals_for)::int as goals_for
    from weeks w
    join club_matches cm on cm.matchweek <= w.matchweek
    group by w.matchweek, cm.team_id
  )
  select
    c.matchweek,
    c.team_id,
    row_number() over (
      partition by c.matchweek
      order by c.points desc, c.goal_difference desc, c.goals_for desc, t.name asc
    )::int as position,
    c.points,
    c.goal_difference
  from cumulative c
  join teams t on t.id = c.team_id
  order by c.matchweek, position
`;

export function positionHistory(
  db: Queryable,
  opts: { season: number; competition?: string },
): Promise<PositionPoint[]> {
  return db
    .query<Record<string, unknown>>(POSITION_HISTORY_SQL, [
      opts.competition ?? DEFAULT_COMPETITION,
      opts.season,
      null,
      "all",
      [],
      null,
    ])
    .then((rows) =>
      rows.map((r) => ({
        matchweek: Number(r.matchweek),
        teamId: Number(r.team_id),
        position: Number(r.position),
        points: Number(r.points),
        goalDifference: Number(r.goal_difference),
      })),
    );
}

function toTableRow(r: Record<string, unknown>): TableRow {
  return {
    position: Number(r.position),
    teamId: Number(r.team_id),
    name: String(r.name),
    shortName: String(r.short_name),
    played: Number(r.played),
    won: Number(r.won),
    drawn: Number(r.drawn),
    lost: Number(r.lost),
    goalsFor: Number(r.goals_for),
    goalsAgainst: Number(r.goals_against),
    goalDifference: Number(r.goal_difference),
    points: Number(r.points),
    form: String(r.form ?? ""),
  };
}
