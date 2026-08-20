import type { SortColumn, SortDirection, Venue } from "./stats";

/**
 * The table view is entirely described by the URL, so any filtered table is a
 * shareable link and the page needs no client-side state at all.
 */

/** Seasons offered in the switcher. Any ingested season is still reachable by URL. */
export const SEASONS = [2025, 2026] as const;

export type OpponentSet = "all" | "top6" | "bottom-half";

export interface ViewParams {
  /** Season start year: 2025 is the 2025/26 season. */
  season: number;
  venue: Venue;
  lastN: number | null;
  opponents: OpponentSet;
  sort: SortColumn;
  direction: SortDirection;
}

export const DEFAULTS: ViewParams = {
  season: 2025,
  venue: "all",
  lastN: null,
  opponents: "all",
  sort: "position",
  direction: "asc",
};

const VENUES: Venue[] = ["all", "home", "away"];
const OPPONENT_SETS: OpponentSet[] = ["all", "top6", "bottom-half"];
const SORTS: SortColumn[] = [
  "position", "name", "played", "won", "drawn", "lost",
  "goalsFor", "goalsAgainst", "goalDifference", "points",
];

type RawParams = Record<string, string | string[] | undefined>;

function one(raw: RawParams, key: string): string | undefined {
  const v = raw[key];
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Parse untrusted query strings into a valid view. Anything unrecognised falls
 * back.
 *
 * `defaultSeason` is passed in rather than hardcoded so the page can default to
 * whichever season actually has results. The season itself is range-checked
 * rather than tested against SEASONS, because a season can be ingested before
 * that list is updated and rejecting it would silently show the wrong year.
 */
export function parseViewParams(
  raw: RawParams,
  defaultSeason: number = DEFAULTS.season,
): ViewParams {
  const season = Number(one(raw, "season"));
  const venue = one(raw, "venue") as Venue | undefined;
  const last = one(raw, "last");
  const opponents = one(raw, "opponents") as OpponentSet | undefined;
  const sort = one(raw, "sort") as SortColumn | undefined;
  const direction = one(raw, "dir");

  const lastN = last && /^\d+$/.test(last) ? Math.min(38, Number(last)) : null;

  return {
    season:
      Number.isInteger(season) && season >= 2000 && season <= 2100
        ? season
        : defaultSeason,
    venue: venue && VENUES.includes(venue) ? venue : DEFAULTS.venue,
    lastN: lastN && lastN > 0 ? lastN : null,
    opponents:
      opponents && OPPONENT_SETS.includes(opponents) ? opponents : DEFAULTS.opponents,
    sort: sort && SORTS.includes(sort) ? sort : DEFAULTS.sort,
    direction: direction === "desc" ? "desc" : direction === "asc" ? "asc" : DEFAULTS.direction,
  };
}

/** Build a URL for a modified view, omitting anything left at its default. */
export function viewHref(current: ViewParams, changes: Partial<ViewParams>, path = "/"): string {
  const next = { ...current, ...changes };
  const qs = new URLSearchParams();

  // Always explicit. The default season moves when a new season starts, so a
  // link that omitted it would quietly come to mean a different year than it
  // did when someone shared it.
  qs.set("season", String(next.season));
  if (next.venue !== DEFAULTS.venue) qs.set("venue", next.venue);
  if (next.lastN !== null) qs.set("last", String(next.lastN));
  if (next.opponents !== DEFAULTS.opponents) qs.set("opponents", next.opponents);
  if (next.sort !== DEFAULTS.sort) qs.set("sort", next.sort);
  if (next.direction !== DEFAULTS.direction) qs.set("dir", next.direction);

  const query = qs.toString();
  return query ? `${path}?${query}` : path;
}

/**
 * Plain-English summary of the current view, so nobody has to reverse-engineer
 * the controls to know what they are looking at.
 */
export function describeView(view: ViewParams): string {
  const parts: string[] = [];

  parts.push(
    view.venue === "home"
      ? "Home matches only"
      : view.venue === "away"
        ? "Away matches only"
        : "All matches",
  );

  if (view.lastN !== null) {
    parts.push(`each club's last ${view.lastN}`);
  }

  if (view.opponents === "top6") {
    parts.push("counting only matches between the current top six");
  } else if (view.opponents === "bottom-half") {
    parts.push("counting only matches between the bottom half");
  }

  const season = `${view.season}/${String(view.season + 1).slice(2)}`;
  return `${parts.join(", ")} — ${season}.`;
}

/** The one-click presets, as URL states rather than separate pages. */
export const PRESET_VIEWS: Array<{ label: string; changes: Partial<ViewParams> }> = [
  { label: "Full table", changes: { venue: "all", lastN: null, opponents: "all" } },
  { label: "Form (last 6)", changes: { venue: "all", lastN: 6, opponents: "all" } },
  { label: "Home only", changes: { venue: "home", lastN: null, opponents: "all" } },
  { label: "Away only", changes: { venue: "away", lastN: null, opponents: "all" } },
  { label: "Top six mini-league", changes: { venue: "all", lastN: null, opponents: "top6" } },
];

/** True when the current view matches a preset, so it can be shown as active. */
export function isPresetActive(view: ViewParams, changes: Partial<ViewParams>): boolean {
  return (Object.keys(changes) as Array<keyof ViewParams>).every(
    (key) => view[key] === changes[key],
  );
}
