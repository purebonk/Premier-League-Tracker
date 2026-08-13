import Link from "next/link";
import { neonQueryable } from "@/db/queryable";
import { standings } from "@/lib/stats";
import { describeView, parseViewParams } from "@/lib/view-params";
import { StandingsTable } from "@/components/StandingsTable";
import { TableControls } from "@/components/TableControls";
import { SeasonNotStarted } from "@/components/SeasonNotStarted";

// 2025/26 never changes and 2026/27 changes only when ingest runs, so pages are
// cached and revalidated rather than recomputed per request.
export const revalidate = 600;

export default async function TablePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const view = parseViewParams(await searchParams);
  const db = neonQueryable();

  // The opponent presets are defined against the *unfiltered* league, so the
  // "top six" stays the actual top six rather than the top six of whatever
  // filter is already applied.
  const base = await standings(db, { season: view.season });

  let opponents: number[] = [];
  if (view.opponents === "top6") {
    opponents = base.slice(0, 6).map((r) => r.teamId);
  } else if (view.opponents === "bottom-half") {
    opponents = base.slice(Math.ceil(base.length / 2)).map((r) => r.teamId);
  }

  const rows = await standings(db, {
    season: view.season,
    venue: view.venue,
    lastN: view.lastN,
    opponents,
    sort: { column: view.sort, direction: view.direction },
  });

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-[20px] font-semibold tracking-tight">League table</h1>
        <p className="max-w-[62ch] text-[13px] leading-relaxed text-ink-muted">
          Every view below is the same SQL aggregation with a different filter.
          Change anything and the URL changes with it, so a table you like is a
          link you can send.
        </p>
      </div>

      <TableControls view={view} />

      <p className="text-[12px] text-ink-muted">{describeView(view)}</p>

      {rows.length === 0 ? (
        <SeasonNotStarted season={view.season} />
      ) : (
        <>
          <StandingsTable rows={rows} view={view} />
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-ink-muted">
            <Link href="/table/gaps" className="underline underline-offset-2 hover:text-ink">
              See the same table as points gaps
            </Link>
            <Link href="/history" className="underline underline-offset-2 hover:text-ink">
              Position over time
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
