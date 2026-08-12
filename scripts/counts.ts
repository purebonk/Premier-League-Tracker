/** Row counts by season — used to prove ingest idempotency. */
import { config } from "dotenv";
config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  const rows = await sql`
    select season, status, count(*)::int as n
    from matches group by season, status order by season, status
  `;
  const totals = await sql`
    select (select count(*)::int from teams)   as teams,
           (select count(*)::int from matches) as matches,
           (select count(*)::int from (select external_id from matches
              group by external_id having count(*) > 1) d) as duplicate_external_ids
  `;
  console.table(rows);
  console.table(totals);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
