/**
 * In-process Postgres for tests.
 *
 * PGlite is real Postgres compiled to WASM, so window functions, lateral
 * joins and views all behave exactly as they do on Neon. Running the actual
 * committed migrations means a schema change that breaks a query fails the
 * test suite rather than production, and the tests need no network, no
 * credentials and no CI secret.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { Queryable } from "../stats";

export interface TestDb extends Queryable {
  raw: PGlite;
}

const MIGRATIONS_DIR = path.resolve(process.cwd(), "drizzle");

export async function createTestDb(): Promise<TestDb> {
  const pg = new PGlite();

  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    // drizzle-kit separates statements with this marker.
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim()) await pg.exec(statement);
    }
  }

  return {
    raw: pg,
    async query<T>(sql: string, params: unknown[]): Promise<T[]> {
      const res = await pg.query<T>(sql, params);
      return res.rows;
    },
  };
}

export interface FixtureMatch {
  home: string;
  away: string;
  homeGoals: number | null;
  awayGoals: number | null;
  kickoff: string;
  status?: "finished" | "scheduled" | "postponed" | "cancelled";
  season?: number;
}

/**
 * Inserts clubs and matches, then materialises matchweeks exactly the way
 * ingest does — so the tests exercise the real derivation rather than a
 * hand-written matchweek column.
 */
export async function seed(
  db: TestDb,
  clubs: string[],
  fixtures: FixtureMatch[],
  competition = "eng.1",
): Promise<Map<string, number>> {
  const ids = new Map<string, number>();

  for (const [i, name] of clubs.entries()) {
    const rows = await db.query<{ id: number }>(
      `insert into teams (external_id, name, short_name, crest_url)
       values ($1, $2, $3, null) returning id`,
      [`ext-${i}-${name}`, name, name],
    );
    ids.set(name, rows[0].id);
  }

  for (const [i, f] of fixtures.entries()) {
    await db.query(
      `insert into matches
         (external_id, competition, season, kicks_off_at, status,
          home_team_id, away_team_id, home_goals, away_goals)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        `m-${i}`,
        competition,
        f.season ?? 2025,
        f.kickoff,
        f.status ?? "finished",
        ids.get(f.home),
        ids.get(f.away),
        f.homeGoals,
        f.awayGoals,
      ],
    );
  }

  await db.query(
    `update matches m set matchweek = d.matchweek
     from derived_matchweeks d where d.id = m.id`,
    [],
  );

  return ids;
}
