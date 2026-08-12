/**
 * Local ingest runner — used for the one-off historical backfill and for
 * proving idempotency without going through the HTTP endpoint.
 *
 *   npx tsx scripts/ingest.ts --season 2025
 *   npx tsx scripts/ingest.ts --dates 20250816-20250818
 */
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };

  // Imported after dotenv so DATABASE_URL is present when src/db initialises.
  const { ingestSeason, ingestWindow } = await import("../src/lib/ingest");
  const { recentWindow } = await import("../src/lib/espn");

  const season = get("--season");
  const dates = get("--dates");

  const result = season
    ? await ingestSeason(Number(season))
    : await ingestWindow(dates ?? recentWindow());

  console.log(JSON.stringify({ ...result, skipped: result.skipped.slice(0, 10) }, null, 2));
  if (result.skipped.length) {
    console.log(`(${result.skipped.length} skipped records total)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
