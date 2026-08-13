/**
 * Club colour resolution.
 *
 * Club colours come from the source, not from us — but a colour that identifies
 * a club is not necessarily a colour you can see. Five of twenty clubs in
 * 2025/26 play in white or near-white, and on a light background their line on
 * a chart would be invisible.
 *
 * This resolves each club to exactly one legible colour, and everything that
 * paints a club calls it: chart lines, table chips, club page headers. Doing it
 * per component is how you end up with a club that is navy in one place and
 * grey in another.
 */

/** Paper ground the UI sits on (#F4F2ED). */
export const GROUND = "f4f2ed";

/**
 * Minimum contrast against the ground. 3:1 is the WCAG threshold for
 * non-text elements such as a chart line or a colour chip.
 */
export const MIN_CONTRAST = 3;

/** Below this HSL saturation a colour has no hue worth preserving. */
const ACHROMATIC_SATURATION = 0.15;

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function parseHex(hex: string | null | undefined): Rgb | null {
  if (!hex) return null;
  const h = hex.trim().replace(/^#/, "").toLowerCase();
  if (!/^[0-9a-f]{6}$/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

export function toHex({ r, g, b }: Rgb): string {
  const c = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `${c(r)}${c(g)}${c(b)}`;
}

/** WCAG relative luminance. */
export function luminance({ r, g, b }: Rgb): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two colours, 1:1 to 21:1. */
export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function saturation({ r, g, b }: Rgb): number {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  if (max === min) return 0;
  const l = (max + min) / 2;
  return l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
}

/** A colour with no meaningful hue: white, black, grey. Darkening one yields grey. */
export function isAchromatic(rgb: Rgb): boolean {
  return saturation(rgb) < ACHROMATIC_SATURATION;
}

/**
 * Scale a colour toward black, preserving hue and saturation, until it meets
 * the contrast threshold. Terminates because black clears 3:1 against any
 * light ground.
 */
function darkenToContrast(rgb: Rgb, ground: Rgb, target: number): Rgb {
  let current = rgb;
  // 40 steps of 5% is enough to reach near-black from any starting colour.
  for (let i = 0; i < 40 && contrast(current, ground) < target; i++) {
    current = { r: current.r * 0.95, g: current.g * 0.95, b: current.b * 0.95 };
  }
  return current;
}

export interface ResolvedColor {
  /** Six hex digits, no leading '#'. */
  hex: string;
  /** Which rule produced it — useful in tests and when explaining the choice. */
  source: "primary" | "secondary" | "darkened-primary" | "darkened-secondary" | "fallback";
  contrast: number;
}

/** Used when a club has no usable colour at all, so the UI always gets something. */
const FALLBACK = "14161a";

/**
 * Resolve a club's display colour.
 *
 * 1. Primary, if it already meets the threshold.
 * 2. Otherwise, when the primary is achromatic (white/grey — nothing to
 *    darken toward), the secondary if that meets the threshold.
 * 3. Otherwise darken: the primary when it has hue worth keeping, the
 *    secondary when the primary is achromatic.
 *
 * The achromatic test is what keeps a club like Newcastle black rather than
 * swapping to their white secondary and darkening it to a hueless grey, and
 * what keeps Manchester City a deep sky blue rather than a black that
 * identifies nothing.
 */
export function resolveClubColor(
  primary: string | null | undefined,
  secondary: string | null | undefined,
  groundHex: string = GROUND,
): ResolvedColor {
  const ground = parseHex(groundHex) ?? { r: 244, g: 242, b: 237 };
  const p = parseHex(primary);
  const s = parseHex(secondary);

  if (p && contrast(p, ground) >= MIN_CONTRAST) {
    return { hex: toHex(p), source: "primary", contrast: contrast(p, ground) };
  }

  const primaryIsAchromatic = p ? isAchromatic(p) : true;

  if (primaryIsAchromatic && s && contrast(s, ground) >= MIN_CONTRAST) {
    return { hex: toHex(s), source: "secondary", contrast: contrast(s, ground) };
  }

  const base = primaryIsAchromatic ? (s ?? p) : p;
  if (!base) {
    const fb = parseHex(FALLBACK)!;
    return { hex: FALLBACK, source: "fallback", contrast: contrast(fb, ground) };
  }

  const darkened = darkenToContrast(base, ground, MIN_CONTRAST);
  return {
    hex: toHex(darkened),
    source: base === s ? "darkened-secondary" : "darkened-primary",
    contrast: contrast(darkened, ground),
  };
}

/** Convenience for JSX: returns "#rrggbb". */
export function clubColor(
  primary: string | null | undefined,
  secondary: string | null | undefined,
): string {
  return `#${resolveClubColor(primary, secondary).hex}`;
}
