import { NextResponse } from "next/server";
import { neonQueryable } from "@/db/queryable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Liveness plus a real dependency check.
 *
 * An endpoint that only proves the process is running would stay green while
 * the database was unreachable, so this round-trips a query and reports how
 * fresh the data is. Freshness matters more than uptime here: the site can
 * serve perfectly while ingest has silently stopped, and that is the failure
 * this is meant to surface.
 */
export async function GET() {
  const startedAt = Date.now();

  try {
    const db = neonQueryable();
    const rows = await db.query<Record<string, unknown>>(
      `select
         (select count(*)::int from matches) as matches,
         (select count(*)::int from teams)   as teams,
         (select max(updated_at) from matches) as last_ingest_at`,
      [],
    );

    const row = rows[0] ?? {};
    const lastIngestAt = row.last_ingest_at ? new Date(row.last_ingest_at as string) : null;
    const ageMinutes = lastIngestAt
      ? Math.round((Date.now() - lastIngestAt.getTime()) / 60000)
      : null;

    return NextResponse.json(
      {
        status: "ok",
        database: "reachable",
        latencyMs: Date.now() - startedAt,
        matches: Number(row.matches ?? 0),
        teams: Number(row.teams ?? 0),
        lastIngestAt: lastIngestAt?.toISOString() ?? null,
        lastIngestAgeMinutes: ageMinutes,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      {
        status: "error",
        database: "unreachable",
        latencyMs: Date.now() - startedAt,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
