import Link from "next/link";
import { neonQueryable } from "@/db/queryable";
import { positionHistory, standings, latestSeasonWithResults } from "@/lib/stats";
import { clubColorPair } from "@/lib/colors";
import { PositionChart, type ChartClub } from "@/components/PositionChart";
import { SeasonNotStarted } from "@/components/SeasonNotStarted";
import { DEFAULTS, parseViewParams } from "@/lib/view-params";

export const revalidate = 600;

export const metadata = {
  title: "Position over time — Premier League Tracker",
};

const GROUPS = ["all", "top6", "bottom6"] as const;
type Group = (typeof GROUPS)[number];

const GROUP_LABELS: Record<Group, string> = {
  all: "All 20",
  top6: "Top six",
  bottom6: "Bottom six",
};

function parseGroup(raw: string | string[] | undefined): Group {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return GROUPS.includes(value as Group) ? (value as Group) : "all";
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const db = neonQueryable();
  const defaultSeason = (await latestSeasonWithResults(db)) ?? DEFAULTS.season;
  const view = parseViewParams(params, defaultSeason);
  const group = parseGroup(params.clubs);

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

  // Groups are defined by the final table, so "top six" means the clubs that
  // finished there rather than whoever happened to be there in a given week --
  // which is what makes watching them converge worth looking at.
  const visibleIds =
    group === "top6"
      ? table.slice(0, 6).map((r) => r.teamId)
      : group === "bottom6"
        ? table.slice(-6).map((r) => r.teamId)
        : undefined;

  const weeks = points.length ? Math.max(...points.map((p) => p.matchweek)) : 0;

  const groupHref = (next: Group) => {
    const qs = new URLSearchParams();
    qs.set("season", String(view.season));
    if (next !== "all") qs.set("clubs", next);
    const query = qs.toString();
    return query ? `/history?${query}` : "/history";
  };

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
        <SeasonNotStarted season={view.season} completedSeason={defaultSeason} />
      ) : (
        <>
          <div className="flex items-center gap-2">
            <span className="label shrink-0">Show</span>
            <div className="flex flex-wrap gap-1">
              {GROUPS.map((option) => (
                <Link
                  key={option}
                  href={groupHref(option)}
                  aria-current={group === option ? "true" : undefined}
                  className={`border px-2 py-1 text-[12px] leading-none transition-colors ${
                    group === option
                      ? "border-ink bg-ink text-raised"
                      : "border-rule bg-raised text-ink-muted hover:border-rule-strong hover:text-ink"
                  }`}
                >
                  {GROUP_LABELS[option]}
                </Link>
              ))}
            </div>
          </div>

          {group !== "all" && (
            <p className="text-[12px] text-ink-muted">
              Showing the six clubs that finished{" "}
              {group === "top6" ? "top" : "bottom"}. The axis stays the full
              league, so positions read as they actually were.
            </p>
          )}

          <PositionChart
            clubs={clubs}
            points={points}
            weeks={weeks}
            visibleIds={visibleIds}
            season={view.season}
          />
        </>
      )}
    </div>
  );
}
