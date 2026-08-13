import { config } from "dotenv"; config({ path: ".env.local" });
async function main() {
  const { neonQueryable } = await import("../src/db/queryable");
  const { resolveClubColor, MIN_CONTRAST } = await import("../src/lib/colors");
  const db = neonQueryable();
  const rows = await db.query<{ short_name: string; primary_color: string | null; secondary_color: string | null }>(
    "select short_name, primary_color, secondary_color from teams order by short_name", []);
  let worst = Infinity, failures = 0;
  console.table(rows.map(r => {
    const res = resolveClubColor(r.primary_color, r.secondary_color);
    worst = Math.min(worst, res.contrast);
    if (res.contrast < MIN_CONTRAST) failures++;
    return { club: r.short_name, primary: r.primary_color, secondary: r.secondary_color,
             display: res.hex, rule: res.source, ratio: res.contrast.toFixed(2) };
  }));
  console.log({ clubs: rows.length, failuresBelow3to1: failures, worstRatio: worst.toFixed(2) });
}
main().catch(e => { console.error(e); process.exit(1); });
