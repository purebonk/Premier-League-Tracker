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

/** Inclusive date-range string for a full season, e.g. 2025 -> Aug 2025..Jun 2026. */
export function seasonDateRange(seasonStartYear: number): string {
  return `${seasonStartYear}0701-${seasonStartYear + 1}0630`;
}
