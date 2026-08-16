import Link from "next/link";
import { neonQueryable } from "@/db/queryable";
import { standings } from "@/lib/stats";
import { clubTintStyle } from "@/lib/colors";
import { parseViewParams } from "@/lib/view-params";
import { SeasonNotStarted } from "@/components/SeasonNotStarted";

export const revalidate = 600;

export const metadata = {
  title: "Points gaps — Premier League Tracker",
};

export default async function CannTablePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const view = parseViewParams(await searchParams);
  const db = neonQueryable();
  const rows = await standings(db, { season: view.season });

  if (rows.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-[20px] font-semibold tracking-tight">Points gaps</h1>
        <SeasonNotStarted season={view.season} />
      </div>
    );
  }

  // One row per points value between the leaders and the bottom club. Values
  // nobody holds are rendered empty, which is the whole point of the format:
  // the vertical space between clubs is the gap in points.
  const top = rows[0].points;
  const bottom = rows[rows.length - 1].points;

  const byPoints = new Map<number, typeof rows>();
  for (const row of rows) {
    const list = byPoints.get(row.points);
    if (list) list.push(row);
    else byPoints.set(row.points, [row]);
  }

  const scale: number[] = [];
  for (let p = top; p >= bottom; p--) scale.push(p);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-[20px] font-semibold tracking-tight">Points gaps</h1>
        <p className="max-w-[64ch] text-[13px] leading-relaxed text-ink-muted">
          A Cann table: the vertical axis is points, so every club sits at its
          own total and empty rows are points nobody holds. It shows the shape
          of a season — a runaway leader, a congested midtable, a detached
          bottom — in a way an evenly spaced table cannot. Named for Jenny Cann,
          an Arsenal supporter who published the format on her site from 1998.
          Matches played in brackets.
        </p>
        <p className="text-[12px] text-ink-muted">
          <Link href="/" className="underline underline-offset-2 hover:text-ink">
            Back to the standard table
          </Link>
        </p>
      </div>

      <div className="border border-rule bg-raised">
        <ol className="divide-y divide-rule">
          {scale.map((pointsValue) => {
            const clubs = byPoints.get(pointsValue) ?? [];
            return (
              <li
                key={pointsValue}
                className={`flex items-start gap-3 px-3 ${
                  clubs.length ? "py-1.5" : "py-[3px]"
                }`}
              >
                <span
                  className={`w-7 shrink-0 pt-[1px] text-right text-[11px] ${
                    clubs.length ? "font-semibold text-ink" : "text-ink-faint"
                  }`}
                >
                  {pointsValue}
                </span>
                <span className="flex min-w-0 flex-wrap gap-x-4 gap-y-1">
                  {clubs.map((club) => (
                    <Link
                      key={club.teamId}
                      href={`/club/${club.slug}`}
                      className="inline-flex items-center gap-1.5 text-[13px] hover:underline"
                    >
                      <span
                        aria-hidden="true"
                        className="club-tint inline-block h-3.5 w-[3px] shrink-0 rounded-[1px]"
                        style={{
                          ...clubTintStyle(club.primaryColor, club.secondaryColor),
                          background: "var(--club)",
                        }}
                      />
                      <span className="truncate">{club.shortName}</span>
                      <span className="text-[11px] text-ink-muted">({club.played})</span>
                    </Link>
                  ))}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
