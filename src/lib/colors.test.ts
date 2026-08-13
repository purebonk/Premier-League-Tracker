import { describe, it, expect } from "vitest";
import {
  resolveClubColor,
  contrast,
  parseHex,
  isAchromatic,
  GROUND,
  MIN_CONTRAST,
} from "./colors";

const ground = parseHex(GROUND)!;
const ratio = (hex: string) => contrast(parseHex(hex)!, ground);

/** Every club in the 2025/26 payload, primary and secondary as ESPN ships them. */
const CLUBS: Array<[string, string, string]> = [
  ["AFC Bournemouth", "f42727", "b57edc"],
  ["Arsenal", "e20520", "003399"],
  ["Aston Villa", "660e36", "333333"],
  ["Brentford", "f42727", "0f1c3f"],
  ["Brighton", "0606fa", "005f60"],
  ["Burnley", "6c1d45", "00ffff"],
  ["Chelsea", "144992", "ffffff"],
  ["Crystal Palace", "0202fb", "ffdd00"],
  ["Everton", "0606fa", "132257"],
  ["Fulham", "ffffff", "00cc00"],
  ["Leeds United", "ffffff", "ffcd00"],
  ["Liverpool", "d11317", "ffffff"],
  ["Manchester City", "99c5ea", "000000"],
  ["Manchester United", "da020e", "ffffff"],
  ["Newcastle United", "000000", "ffffff"],
  ["Nottingham Forest", "c8102e", "132257"],
  ["Sunderland", "eb172b", "87cced"],
  ["Tottenham Hotspur", "ffffff", "000000"],
  ["West Ham United", "7c2c3b", "f1e7e0"],
  ["Wolves", "fdb913", "32a8dd"],
];

describe("resolveClubColor", () => {
  it("returns a legible colour for every club in the league", () => {
    for (const [club, primary, secondary] of CLUBS) {
      const resolved = resolveClubColor(primary, secondary);
      expect(
        resolved.contrast,
        `${club} resolved to #${resolved.hex} at ${resolved.contrast.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });

  it("keeps a primary that is already legible", () => {
    const arsenal = resolveClubColor("e20520", "003399");
    expect(arsenal).toMatchObject({ hex: "e20520", source: "primary" });
  });

  it("keeps a dark achromatic primary rather than swapping it", () => {
    // Newcastle are black. A rule that swapped whenever a fallback existed
    // would send them to their white secondary and darken it to grey.
    const newcastle = resolveClubColor("000000", "ffffff");
    expect(newcastle).toMatchObject({ hex: "000000", source: "primary" });
  });

  it("swaps to the secondary when the primary is white and the secondary works", () => {
    const spurs = resolveClubColor("ffffff", "000000");
    expect(spurs).toMatchObject({ hex: "000000", source: "secondary" });
  });

  it("darkens a light primary that has hue rather than swapping it away", () => {
    // Manchester City's secondary is black, which passes contrast easily but
    // identifies nothing. Their sky blue darkened still reads as City.
    const city = resolveClubColor("99c5ea", "000000");
    expect(city.source).toBe("darkened-primary");
    expect(city.contrast).toBeGreaterThanOrEqual(MIN_CONTRAST);

    // Still recognisably blue: blue channel dominant, hue preserved.
    const rgb = parseHex(city.hex)!;
    expect(rgb.b).toBeGreaterThan(rgb.r);
    expect(rgb.b).toBeGreaterThan(rgb.g);
  });

  it("darkens gold rather than swapping to an unrelated secondary", () => {
    const wolves = resolveClubColor("fdb913", "32a8dd");
    expect(wolves.source).toBe("darkened-primary");
    const rgb = parseHex(wolves.hex)!;
    // Still gold: red and green well above blue.
    expect(rgb.r).toBeGreaterThan(rgb.b);
    expect(rgb.g).toBeGreaterThan(rgb.b);
  });

  it("darkens the secondary when the primary is white and the secondary is also too light", () => {
    // Leeds: white primary, yellow secondary at 1.28:1. Neither is usable as
    // given, and white has no hue, so the yellow gets darkened.
    const leeds = resolveClubColor("ffffff", "ffcd00");
    expect(leeds.source).toBe("darkened-secondary");
    expect(leeds.contrast).toBeGreaterThanOrEqual(MIN_CONTRAST);
    const rgb = parseHex(leeds.hex)!;
    expect(rgb.r).toBeGreaterThan(rgb.b);
  });

  it("falls back to ink when a club has no colours at all", () => {
    expect(resolveClubColor(null, null)).toMatchObject({ source: "fallback" });
    expect(resolveClubColor("not-a-colour", undefined).source).toBe("fallback");
  });

  it("is deterministic", () => {
    expect(resolveClubColor("ffffff", "00cc00")).toEqual(
      resolveClubColor("ffffff", "00cc00"),
    );
  });

  it("accepts a leading hash and mixed case", () => {
    expect(resolveClubColor("#E20520", "#003399").hex).toBe("e20520");
  });
});

describe("contrast helpers", () => {
  it("computes known WCAG ratios against the paper ground", () => {
    // #F4F2ED has a relative luminance of ~0.889.
    expect(ratio("000000")).toBeCloseTo(18.77, 1);
    expect(ratio("ffffff")).toBeCloseTo(1.12, 1);
  });

  it("identifies colours with no hue to preserve", () => {
    expect(isAchromatic(parseHex("ffffff")!)).toBe(true);
    expect(isAchromatic(parseHex("000000")!)).toBe(true);
    expect(isAchromatic(parseHex("808080")!)).toBe(true);
    expect(isAchromatic(parseHex("e20520")!)).toBe(false);
    expect(isAchromatic(parseHex("fdb913")!)).toBe(false);
  });
});
