import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { ingestWindow, ingestSeason, type IngestResult } from "@/lib/ingest";
import { recentWindow } from "@/lib/espn";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Constant-time secret comparison. A plain `===` leaks how much of the secret
 * matched via response timing, which is exactly the thing a shared-secret
 * endpoint should not do.
 */
function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function handle(request: Request): Promise<NextResponse> {
  const expected = process.env.INGEST_SECRET;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "INGEST_SECRET is not configured" },
      { status: 500 },
    );
  }

  if (!secretMatches(request.headers.get("x-ingest-secret"), expected)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const season = url.searchParams.get("season");
  const dates = url.searchParams.get("dates");

  const startedAt = Date.now();
  try {
    let result: IngestResult;
    if (season) {
      const year = Number(season);
      if (!Number.isInteger(year) || year < 2000 || year > 2100) {
        return NextResponse.json(
          { ok: false, error: `invalid season: ${season}` },
          { status: 400 },
        );
      }
      result = await ingestSeason(year);
    } else {
      result = await ingestWindow(dates ?? recentWindow());
    }

    // Structured log line -- one JSON object per run, greppable in Vercel logs.
    console.log(
      JSON.stringify({
        event: "ingest.complete",
        window: result.window,
        fetched: result.fetched,
        teamsUpserted: result.teamsUpserted,
        matchesUpserted: result.matchesUpserted,
        skipped: result.skipped.length,
        durationMs: result.durationMs,
      }),
    );

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      JSON.stringify({
        event: "ingest.failed",
        error: message,
        durationMs: Date.now() - startedAt,
      }),
    );
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}

export const POST = handle;
// GET is allowed so the endpoint can be smoke-tested with curl; it is guarded
// by the same shared secret.
export const GET = handle;
