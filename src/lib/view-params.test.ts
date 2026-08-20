import { describe, it, expect } from "vitest";
import {
  DEFAULTS,
  PRESET_VIEWS,
  describeView,
  isPresetActive,
  parseViewParams,
  viewHref,
} from "./view-params";

describe("parseViewParams", () => {
  it("falls back to defaults for an empty query string", () => {
    expect(parseViewParams({})).toEqual(DEFAULTS);
  });

  it("uses the supplied default season rather than a hardcoded year", () => {
    // The site follows whichever season has results, so the default moves.
    expect(parseViewParams({}, 2026).season).toBe(2026);
    expect(parseViewParams({ season: "2025" }, 2026).season).toBe(2025);
  });

  it("accepts a season not yet listed in the switcher", () => {
    // A season can be ingested before SEASONS is updated; rejecting it would
    // silently show the wrong year.
    expect(parseViewParams({ season: "2027" }).season).toBe(2027);
  });

  it("rejects nonsense rather than passing it to the database", () => {
    expect(parseViewParams({ season: "1066" }, 2026).season).toBe(2026);
    expect(parseViewParams({ season: "drop table" }, 2026).season).toBe(2026);
    expect(parseViewParams({ venue: "moon" }).venue).toBe("all");
    expect(parseViewParams({ sort: "; delete" }).sort).toBe("position");
    expect(parseViewParams({ opponents: "everyone" }).opponents).toBe("all");
    expect(parseViewParams({ dir: "sideways" }).direction).toBe(DEFAULTS.direction);
  });

  it("clamps the recency window to a sane range", () => {
    expect(parseViewParams({ last: "6" }).lastN).toBe(6);
    expect(parseViewParams({ last: "999" }).lastN).toBe(38);
    expect(parseViewParams({ last: "0" }).lastN).toBeNull();
    expect(parseViewParams({ last: "-4" }).lastN).toBeNull();
    expect(parseViewParams({ last: "abc" }).lastN).toBeNull();
  });

  it("takes the first value when a parameter is repeated", () => {
    expect(parseViewParams({ venue: ["home", "away"] }).venue).toBe("home");
  });
});

describe("viewHref", () => {
  it("always states the season, so a shared link keeps its meaning", () => {
    // Omitting it would make the link mean whatever the default becomes once
    // a new season starts.
    const view = parseViewParams({}, 2025);
    expect(viewHref(view, {})).toBe("/?season=2025");
  });

  it("omits everything else that is still at its default", () => {
    const view = parseViewParams({}, 2025);
    expect(viewHref(view, { venue: "away" })).toBe("/?season=2025&venue=away");
  });

  it("round-trips through the parser", () => {
    const view = parseViewParams(
      { season: "2026", venue: "away", last: "6", opponents: "top6", sort: "points", dir: "desc" },
      2025,
    );
    const href = viewHref(view, {});
    const parsed = parseViewParams(
      Object.fromEntries(new URLSearchParams(href.split("?")[1])),
      2025,
    );
    expect(parsed).toEqual(view);
  });

  it("respects an alternate path", () => {
    const view = parseViewParams({}, 2025);
    expect(viewHref(view, {}, "/table/gaps")).toBe("/table/gaps?season=2025");
  });
});

describe("describeView", () => {
  it("describes the default view in plain English", () => {
    expect(describeView(parseViewParams({}, 2025))).toBe("All matches — 2025/26.");
  });

  it("names every active filter", () => {
    const view = parseViewParams({ venue: "away", last: "6", opponents: "top6" }, 2025);
    expect(describeView(view)).toBe(
      "Away matches only, each club's last 6, counting only matches between the current top six — 2025/26.",
    );
  });
});

describe("PRESET_VIEWS", () => {
  it("marks a preset active only when every one of its fields matches", () => {
    const away = PRESET_VIEWS.find((p) => p.label === "Away only")!;
    expect(isPresetActive(parseViewParams({ venue: "away" }), away.changes)).toBe(true);
    expect(isPresetActive(parseViewParams({ venue: "home" }), away.changes)).toBe(false);
    // Away + last 6 is not the plain "Away only" preset.
    expect(
      isPresetActive(parseViewParams({ venue: "away", last: "6" }), away.changes),
    ).toBe(false);
  });

  it("every preset is reachable from the default view", () => {
    const base = parseViewParams({}, 2025);
    for (const preset of PRESET_VIEWS) {
      const next = parseViewParams(
        Object.fromEntries(new URLSearchParams(viewHref(base, preset.changes).split("?")[1])),
        2025,
      );
      expect(isPresetActive(next, preset.changes)).toBe(true);
    }
  });
});
