import Link from "next/link";

const SEASON_OPENS = new Date("2026-08-21T00:00:00Z");

function label(season: number): string {
  return `${season}/${String(season + 1).slice(2)}`;
}

/**
 * Empty states point somewhere. Before a season opens there is no table to
 * show, but there are fixtures and a date, which is what someone arriving
 * actually wants to know.
 *
 * `completedSeason` is passed in rather than hardcoded so the links keep
 * pointing at a season that exists once this one is no longer the newest.
 */
export function SeasonNotStarted({
  season,
  completedSeason,
}: {
  season: number;
  completedSeason?: number | null;
}) {
  // No clock reading here: this only renders when a season has no results, so
  // naming its opening date is correct whenever it appears, and reading the
  // time during render would make the output non-idempotent.
  const opensSoon = season === 2026;
  const elsewhere =
    completedSeason && completedSeason !== season ? completedSeason : null;

  return (
    <div className="border border-rule bg-raised px-5 py-6">
      <h2 className="text-[15px] font-semibold">No results yet in {label(season)}</h2>
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
          <>
            Fixtures for this season are ingested, but no matches have been
            played yet. The table fills in as results arrive.
          </>
        )}
      </p>
      {elsewhere && (
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
          <Link href={`/?season=${elsewhere}`} className="underline underline-offset-2">
            See the completed {label(elsewhere)} season
          </Link>
          <Link
            href={`/history?season=${elsewhere}`}
            className="underline underline-offset-2"
          >
            How that season unfolded
          </Link>
        </div>
      )}
    </div>
  );
}
