import Link from "next/link";

const SEASON_OPENS = new Date("2026-08-21T00:00:00Z");

/**
 * Empty states point somewhere. Before a season opens there is no table to
 * show, but there are fixtures and a date, which is what someone arriving
 * actually wants to know.
 */
export function SeasonNotStarted({ season }: { season: number }) {
  const label = `${season}/${String(season + 1).slice(2)}`;
  const opensSoon = season === 2026;

  return (
    <div className="border border-rule bg-raised px-5 py-6">
      <h2 className="text-[15px] font-semibold">No results yet in {label}</h2>
      <p className="mt-2 max-w-[58ch] text-[13px] leading-relaxed text-ink-muted">
        {opensSoon ? (
          <>
            The season opens on{" "}
            <strong className="font-semibold text-ink">
              {SEASON_OPENS.toLocaleDateString("en-GB", {
                weekday: "long",
                day: "numeric",
                month: "long",
                timeZone: "UTC",
              })}
            </strong>
            . Fixtures are already ingested and the table will fill in as
            results arrive.
          </>
        ) : (
          <>No matches have been ingested for this season yet.</>
        )}
      </p>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
        <Link href="/?season=2025" className="underline underline-offset-2">
          See the completed 2025/26 season
        </Link>
        <Link href="/history?season=2025" className="underline underline-offset-2">
          How that season unfolded
        </Link>
      </div>
    </div>
  );
}
