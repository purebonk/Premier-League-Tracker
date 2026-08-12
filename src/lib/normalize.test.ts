import { describe, it, expect } from "vitest";
import { normalizeEvent, normalizeStatus, parseClock } from "./normalize";
import type { EspnEvent } from "./espn";
import fixtures from "./__fixtures__/events.json";

const events = fixtures as unknown as EspnEvent[];
const [liverpoolBournemouth, draw, scheduled] = events;

describe("parseClock", () => {
  it("splits stoppage time from the half boundary", () => {
    // "90'+7'" is minute 90 plus 7 of stoppage, NOT minute 97.
    expect(parseClock("90'+7'")).toEqual({ minute: 90, stoppageMinute: 7 });
    expect(parseClock("45'+2'")).toEqual({ minute: 45, stoppageMinute: 2 });
  });

  it("handles a plain running clock", () => {
    expect(parseClock("67'")).toEqual({ minute: 67, stoppageMinute: null });
    expect(parseClock("0'")).toEqual({ minute: 0, stoppageMinute: null });
  });

  it("returns nulls for missing or junk input", () => {
    expect(parseClock(undefined)).toEqual({ minute: null, stoppageMinute: null });
    expect(parseClock("")).toEqual({ minute: null, stoppageMinute: null });
    expect(parseClock("HT")).toEqual({ minute: null, stoppageMinute: null });
  });
});

describe("normalizeStatus", () => {
  const withStatus = (name?: string, state?: string) =>
    ({ id: "1", date: "2025-08-16T11:30Z", status: { type: { name, state } } }) as EspnEvent;

  it("maps ESPN's status vocabulary onto our lifecycle states", () => {
    expect(normalizeStatus(withStatus("STATUS_FULL_TIME"))).toBe("finished");
    expect(normalizeStatus(withStatus("STATUS_SCHEDULED"))).toBe("scheduled");
    expect(normalizeStatus(withStatus("STATUS_HALFTIME"))).toBe("live");
    expect(normalizeStatus(withStatus("STATUS_POSTPONED"))).toBe("postponed");
    expect(normalizeStatus(withStatus("STATUS_CANCELED"))).toBe("cancelled");
  });

  it("falls back to state when ESPN invents a new status string", () => {
    expect(normalizeStatus(withStatus("STATUS_SOMETHING_NEW", "in"))).toBe("live");
    expect(normalizeStatus(withStatus("STATUS_SOMETHING_NEW", "post"))).toBe("finished");
    expect(normalizeStatus(withStatus(undefined, undefined))).toBe("scheduled");
  });
});

describe("normalizeEvent", () => {
  it("normalizes a completed match from the real payload", () => {
    const m = normalizeEvent(liverpoolBournemouth)!;
    expect(m).not.toBeNull();
    expect(m.competition).toBe("eng.1");
    // ESPN's season.year is the season START year.
    expect(m.season).toBe(2025);
    expect(m.status).toBe("finished");
    expect(m.home.name).toBe("Liverpool");
    expect(m.away.name).toBe("AFC Bournemouth");
    // shortDisplayName is what the UI renders in tight columns.
    expect(m.away.shortName).toBe("Bournemouth");
    // Scores arrive as strings and must come back as numbers.
    expect(m.homeGoals).toBe(4);
    expect(m.awayGoals).toBe(2);
    expect(typeof m.homeGoals).toBe("number");
    expect(m.kicksOffAt.toISOString()).toBe("2025-08-15T19:00:00.000Z");
  });

  it("keeps a 0-0 draw distinct from an unplayed match", () => {
    const m = normalizeEvent(draw)!;
    expect(m.status).toBe("finished");
    expect(m.homeGoals).toBe(0);
    expect(m.awayGoals).toBe(0);
  });

  it("does not record a clock for a match that has not kicked off", () => {
    const m = normalizeEvent(scheduled)!;
    expect(m.status).toBe("scheduled");
    expect(m.season).toBe(2026);
    // ESPN reports "0'" before kickoff; storing minute 0 would imply it started.
    expect(m.minute).toBeNull();
    expect(m.stoppageMinute).toBeNull();
  });

  it("returns null for records ingest should skip rather than crash on", () => {
    expect(normalizeEvent({} as EspnEvent)).toBeNull();
    expect(normalizeEvent({ id: "1", date: "not-a-date" } as EspnEvent)).toBeNull();
    expect(
      normalizeEvent({
        id: "1",
        date: "2025-08-16T11:30Z",
        competitions: [{ competitors: [] }],
      } as EspnEvent),
    ).toBeNull();
  });
});
