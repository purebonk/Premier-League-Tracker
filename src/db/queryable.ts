import { neon } from "@neondatabase/serverless";
import type { Queryable } from "@/lib/stats";

/**
 * Adapter letting the derived-stat SQL run against Neon in the app, while the
 * same strings run against in-process Postgres in tests.
 */
export function neonQueryable(connectionString = process.env.DATABASE_URL): Queryable {
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const sql = neon(connectionString);
  return {
    async query<T>(text: string, params: unknown[]): Promise<T[]> {
      return (await sql.query(text, params as never[])) as T[];
    },
  };
}
