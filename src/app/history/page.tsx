import { neonQueryable } from "@/db/queryable";
import { positionHistory, standings } from "@/lib/stats";
import { clubColorPair } from "@/lib/colors";
import { PositionChart, type ChartClub } from "@/components/PositionChart";
import { SeasonNotStarted } from "@/components/SeasonNotStarted";
import { parseViewParams } from "@/lib/view-params";

export const revalidate = 600;

export const metadata = {
  title: "Position over time — Premier League Tracker",
};

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const view = parseViewParams(await searchParams);
  const db = neonQueryable();

  // Both queries are server-side; the client component receives finished data
  // and never fetches. The interaction is client-side, the computation is not.
  const [points, table] = await Promise.all([
    positionHistory(db, { season: view.season }),
    standings(db, { season: view.season }),
  ]);

  const clubs: ChartClub[] = table.map((row) => {
    const { light, dark } = clubColorPair(row.primaryColor, row.secondaryColor);
    return {
      teamId: row.teamId,
      name: row.name,
      shortName: row.shortName,
      slug: row.slug,
      colorLight: light,
      colorDark: dark,
    };
  });

  const weeks = points.length ? Math.max(...points.map((p) => p.matchweek)) : 0;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-[20px] font-semibold tracking-tight">Position over time</h1>
        <p className="max-w-[62ch] text-[13px] leading-relaxed text-ink-muted">
          Every club&rsquo;s league position across the {view.season}/
          {String(view.season + 1).slice(2)} season. Drag the slider to move
          through the year and the table beside the chart reorders to the
          standings at that point. Hover a line to isolate it; click to hold it.
        </p>
      </div>

      {weeks === 0 ? (
        <SeasonNotStarted season={view.season} />
      ) : (
        <PositionChart clubs={clubs} points={points} weeks={weeks} />
      )}
    </div>
  );
}
