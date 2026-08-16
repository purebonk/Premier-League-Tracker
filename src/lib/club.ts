import type { Queryable } from "./stats";
import { DEFAULT_COMPETITION } from "./stats";
import { slugify } from "./slug";

export interface Club {
  id: number;
  name: string;
  shortName: string;
  primaryColor: string | null;
  secondaryColor: string | null;
  slug: string;
}

/**
 * Slugs are derived from names rather than stored, so resolving one means
 * matching against the derived slug. Twenty-odd clubs is small enough that a
 * scan is cheaper than maintaining a column that could drift from the name.
 */
export async function findClubBySlug(db: Queryable, slug: string): Promise<Club | null> {
  const rows = await db.query<Record<string, unknown>>(
    `select id, name, short_name, primary_color, secondary_color from teams`,
    [],
  );
  const match = rows.find((r) => slugify(String(r.name)) === slug);
  if (!match) return null;
  return {
    id: Number(match.id),
    name: String(match.name),
    shortName: String(match.short_name),
    primaryColor: (match.primary_color as string | null) ?? null,
    secondaryColor: (match.secondary_color as string | null) ?? null,
    slug,
  };
}

export interface ClubMatch {
  id: number;
  matchweek: number | null;
  kicksOffAt: Date;
  status: string;
  venue: "home" | "away";
  opponentName: string;
  opponentSlug: string;
  goalsFor: number | null;
  goalsAgainst: number | null;
  outcome: "W" | "D" | "L" | null;
}

/**
 * Every fixture for one club in one season, from that club's point of view,
 * including those not yet played. The same lateral fan-out as the standings
 * queries, restricted to a single club and not filtered to finished matches --
 * a club page has to show what is coming as well as what happened.
 */
const CLUB_MATCHES_SQL = /* sql */ `
  select
    m.id,
    m.matchweek,
    m.kicks_off_at,
    m.status,
    case when m.home_team_id = $3::int then 'home' else 'away' end as venue,
    opp.name as opponent_name,
    case when m.home_team_id = $3::int then m.home_goals else m.away_goals end as goals_for,
    case when m.home_team_id = $3::int then m.away_goals else m.home_goals end as goals_against
  from matches m
  join teams opp
    on opp.id = case when m.home_team_id = $3::int then m.away_team_id else m.home_team_id end
  where m.competition = $1
    and m.season = $2
    and (m.home_team_id = $3::int or m.away_team_id = $3::int)
  order by m.kicks_off_at asc, m.id asc
`;

function outcomeOf(gf: number | null, ga: number | null, status: string): "W" | "D" | "L" | null {
  if (status !== "finished" || gf === null || ga === null) return null;
  return gf > ga ? "W" : gf === ga ? "D" : "L";
}

export async function clubMatches(
  db: Queryable,
  opts: { season: number; teamId: number; competition?: string },
): Promise<ClubMatch[]> {
  const rows = await db.query<Record<string, unknown>>(CLUB_MATCHES_SQL, [
    opts.competition ?? DEFAULT_COMPETITION,
    opts.season,
    opts.teamId,
  ]);

  return rows.map((r) => {
    const goalsFor = r.goals_for === null ? null : Number(r.goals_for);
    const goalsAgainst = r.goals_against === null ? null : Number(r.goals_against);
    const status = String(r.status);
    return {
      id: Number(r.id),
      matchweek: r.matchweek === null ? null : Number(r.matchweek),
      kicksOffAt: new Date(r.kicks_off_at as string),
      status,
      venue: String(r.venue) as "home" | "away",
      opponentName: String(r.opponent_name),
      opponentSlug: slugify(String(r.opponent_name)),
      goalsFor,
      goalsAgainst,
      outcome: outcomeOf(goalsFor, goalsAgainst, status),
    };
  });
}

/**
 * The club's next fixture across all stored seasons — used to surface a
 * head-to-head record for a match that is actually coming up.
 */
export async function nextFixture(
  db: Queryable,
  opts: { teamId: number; now?: Date; competition?: string },
): Promise<{ opponentId: number; opponentName: string; opponentSlug: string; kicksOffAt: Date; venue: "home" | "away" } | null> {
  const rows = await db.query<Record<string, unknown>>(
    /* sql */ `
      select
        m.kicks_off_at,
        case when m.home_team_id = $2::int then 'home' else 'away' end as venue,
        opp.id as opponent_id,
        opp.name as opponent_name
      from matches m
      join teams opp
        on opp.id = case when m.home_team_id = $2::int then m.away_team_id else m.home_team_id end
      where m.competition = $1
        and (m.home_team_id = $2::int or m.away_team_id = $2::int)
        and m.status in ('scheduled', 'live')
        and m.kicks_off_at >= $3
      order by m.kicks_off_at asc
      limit 1
    `,
    [opts.competition ?? DEFAULT_COMPETITION, opts.teamId, (opts.now ?? new Date()).toISOString()],
  );

  const r = rows[0];
  if (!r) return null;
  return {
    opponentId: Number(r.opponent_id),
    opponentName: String(r.opponent_name),
    opponentSlug: slugify(String(r.opponent_name)),
    kicksOffAt: new Date(r.kicks_off_at as string),
    venue: String(r.venue) as "home" | "away",
  };
}
