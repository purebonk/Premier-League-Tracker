import type { EspnEvent, EspnTeam } from "./espn";
import type { MatchStatus } from "@/db/schema";

/**
 * ESPN's STATUS_* vocabulary mapped onto our five lifecycle states.
 * Anything unrecognised falls back to `state` (pre / in / post), so a new
 * ESPN status string degrades to a sane value instead of breaking ingest.
 */
const STATUS_MAP: Record<string, MatchStatus> = {
  STATUS_SCHEDULED: "scheduled",
  STATUS_PRE_GAME: "scheduled",
  STATUS_DELAYED: "scheduled",

  STATUS_IN_PROGRESS: "live",
  STATUS_FIRST_HALF: "live",
  STATUS_SECOND_HALF: "live",
  STATUS_HALFTIME: "live",
  STATUS_EXTRA_TIME: "live",
  STATUS_SHOOTOUT: "live",

  STATUS_FULL_TIME: "finished",
  STATUS_FINAL: "finished",
  STATUS_FINAL_AET: "finished",
  STATUS_FINAL_PEN: "finished",

  STATUS_POSTPONED: "postponed",
  STATUS_SUSPENDED: "postponed",
  STATUS_ABANDONED: "cancelled",
  STATUS_CANCELED: "cancelled",
  STATUS_CANCELLED: "cancelled",
  STATUS_FORFEIT: "cancelled",
};

export function normalizeStatus(event: EspnEvent): MatchStatus {
  const name = event.status?.type?.name;
  if (name && STATUS_MAP[name]) return STATUS_MAP[name];

  switch (event.status?.type?.state) {
    case "in":
      return "live";
    case "post":
      return "finished";
    default:
      return "scheduled";
  }
}

/**
 * A football clock counts up and adds stoppage on top of a fixed half boundary:
 * "90'+7'" means minute 90 plus 7 of stoppage -- it is NOT minute 97, and
 * sorting or comparing it as 97 puts it ahead of a real 93rd-minute event in
 * extra time. We keep the two numbers separate and let the UI recombine them.
 */
export function parseClock(displayClock: string | undefined | null): {
  minute: number | null;
  stoppageMinute: number | null;
} {
  if (!displayClock) return { minute: null, stoppageMinute: null };

  const match = displayClock.match(/(\d+)\s*'?\s*(?:\+\s*(\d+))?/);
  if (!match) return { minute: null, stoppageMinute: null };

  const minute = Number(match[1]);
  const stoppage = match[2] !== undefined ? Number(match[2]) : null;

  return {
    minute: Number.isFinite(minute) ? minute : null,
    stoppageMinute: stoppage !== null && Number.isFinite(stoppage) ? stoppage : null,
  };
}

/** ESPN sends scores as strings ("4"); absent before kickoff. */
function parseScore(raw: string | undefined): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export interface NormalizedTeam {
  externalId: string;
  name: string;
  shortName: string;
  crestUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
}

/** Accepts "#RRGGBB" or "RRGGBB"; returns lowercase "rrggbb" or null. */
export function normalizeHex(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const hex = raw.trim().replace(/^#/, "").toLowerCase();
  return /^[0-9a-f]{6}$/.test(hex) ? hex : null;
}

export interface NormalizedMatch {
  externalId: string;
  competition: string;
  season: number;
  kicksOffAt: Date;
  status: MatchStatus;
  home: NormalizedTeam;
  away: NormalizedTeam;
  homeGoals: number | null;
  awayGoals: number | null;
  minute: number | null;
  stoppageMinute: number | null;
}

function normalizeTeam(t: EspnTeam): NormalizedTeam {
  return {
    externalId: t.id,
    name: t.displayName,
    shortName: t.shortDisplayName || t.abbreviation || t.displayName,
    crestUrl: t.logo ?? null,
    primaryColor: normalizeHex(t.color),
    secondaryColor: normalizeHex(t.alternateColor),
  };
}

/**
 * Returns null for any event we cannot trust -- missing id, missing a side,
 * unparseable kickoff. Ingest logs and skips these rather than failing the run.
 */
export function normalizeEvent(
  event: EspnEvent,
  competition = "eng.1",
): NormalizedMatch | null {
  if (!event?.id) return null;

  const competitors = event.competitions?.[0]?.competitors ?? [];
  const home = competitors.find((c) => c.homeAway === "home");
  const away = competitors.find((c) => c.homeAway === "away");
  if (!home?.team?.id || !away?.team?.id) return null;

  const kicksOffAt = new Date(event.date);
  if (Number.isNaN(kicksOffAt.getTime())) return null;

  // ESPN's season.year is the season START year: 2025 == the 2025/26 season.
  // Fall back to deriving it from the kickoff (Jul-Dec => that year).
  const season =
    event.season?.year ??
    (kicksOffAt.getUTCMonth() >= 6
      ? kicksOffAt.getUTCFullYear()
      : kicksOffAt.getUTCFullYear() - 1);

  const status = normalizeStatus(event);
  const { minute, stoppageMinute } = parseClock(event.status?.displayClock);

  return {
    externalId: event.id,
    competition,
    season,
    kicksOffAt,
    status,
    home: normalizeTeam(home.team),
    away: normalizeTeam(away.team),
    homeGoals: parseScore(home.score),
    awayGoals: parseScore(away.score),
    // A scheduled match reports clock 0'; storing that as minute 0 implies
    // kickoff has happened, so only keep the clock once it is live.
    minute: status === "live" ? minute : null,
    stoppageMinute: status === "live" ? stoppageMinute : null,
  };
}
