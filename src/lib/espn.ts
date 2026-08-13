/**
 * Thin client for ESPN's public (undocumented, no-auth) soccer scoreboard.
 *
 * Only the ingest path may import this. The user-facing read path reads our
 * own Postgres and never touches ESPN.
 */

const PRIMARY_HOST = "https://site.api.espn.com";
const FALLBACK_HOST = "https://site.web.api.espn.com";
const PATH = "/apis/site/v2/sports/soccer/eng.1/scoreboard";

/**
 * The scoreboard defaults to 100 events regardless of how wide the date range
 * is -- a full season silently truncates. A full Premier League season is
 * 380 matches, so we ask for headroom above that.
 */
export const EVENT_LIMIT = 500;

/** Only the fields we actually consume; ESPN sends far more. */
export interface EspnTeam {
  id: string;
  displayName: string;
  shortDisplayName: string;
  abbreviation: string;
  logo?: string;
  /** Six hex digits, no leading '#'. */
  color?: string;
  alternateColor?: string;
}

export interface EspnCompetitor {
  homeAway: "home" | "away";
  score?: string;
  team: EspnTeam;
}

export interface EspnEvent {
  id: string;
  date: string;
  shortName?: string;
  season?: { year?: number };
  status?: {
    displayClock?: string;
    type?: { name?: string; state?: string; completed?: boolean };
  };
  competitions?: Array<{ competitors?: EspnCompetitor[] }>;
}

export interface EspnScoreboard {
  events?: EspnEvent[];
}

export class EspnError extends Error {}

/**
 * `dates` is ESPN's format: "YYYYMMDD" or "YYYYMMDD-YYYYMMDD".
 * Falls back to the alternate host if the primary returns a 4xx.
 */
export async function fetchScoreboard(
  dates: string,
  { limit = EVENT_LIMIT, signal }: { limit?: number; signal?: AbortSignal } = {},
): Promise<EspnEvent[]> {
  const qs = `?dates=${encodeURIComponent(dates)}&limit=${limit}`;
  let lastError = "";

  for (const host of [PRIMARY_HOST, FALLBACK_HOST]) {
    let res: Response;
    try {
      res = await fetch(`${host}${PATH}${qs}`, {
        signal,
        headers: { accept: "application/json" },
        cache: "no-store",
      });
    } catch (err) {
      lastError = `${host}: ${err instanceof Error ? err.message : String(err)}`;
      continue;
    }

    if (res.ok) {
      const body = (await res.json()) as EspnScoreboard;
      return body.events ?? [];
    }

    lastError = `${host}: HTTP ${res.status}`;
    // 5xx is the upstream having a bad day; the other host is the same origin
    // cluster, so only a 4xx is worth retrying elsewhere.
    if (res.status < 400 || res.status >= 500) break;
  }

  throw new EspnError(`ESPN scoreboard fetch failed (${lastError})`);
}

/** Inclusive date-range string for a full season, e.g. 2025 -> Jul 2025..Jun 2026. */
export function seasonDateRange(seasonStartYear: number): string {
  return `${seasonStartYear}0701-${seasonStartYear + 1}0630`;
}

function yyyymmdd(d: Date): string {
  return (
    `${d.getUTCFullYear()}` +
    `${String(d.getUTCMonth() + 1).padStart(2, "0")}` +
    `${String(d.getUTCDate()).padStart(2, "0")}`
  );
}

/**
 * The window the scheduled ingest polls: 3 days back, 10 days forward,
 * measured against the current **UTC** date.
 *
 * UTC matters when reading logs. A run at 04:10 UTC on Aug 13 reports the
 * window 20260810-20260823, which from Vancouver (Aug 12, 21:10 PDT) looks
 * like -2/+11 rather than -3/+10. The boundaries are UTC-relative, not
 * local-relative.
 *
 * Looks backwards as well as forwards: a match that finished after the last
 * run still needs its final score written, and kickoff times get moved for
 * TV, so upcoming fixtures must be re-read rather than trusted from a
 * single earlier fetch. The window is deliberately far wider than the 10
 * minute cron interval, so any timezone skew between our UTC boundaries and
 * ESPN's own interpretation of `dates` is absorbed many times over.
 */
export function recentWindow(daysBack = 3, daysForward = 10, now = new Date()): string {
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - daysBack);
  const to = new Date(now);
  to.setUTCDate(to.getUTCDate() + daysForward);
  return `${yyyymmdd(from)}-${yyyymmdd(to)}`;
}
