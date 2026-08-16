import Link from "next/link";
import type { SortColumn, TableRow } from "@/lib/stats";
import { viewHref, type ViewParams } from "@/lib/view-params";
import { ClubMark } from "./ClubMark";
import { FormStrip } from "./FormStrip";

const COLUMNS: Array<{
  key: SortColumn;
  label: string;
  title: string;
  /** Descending is "best first" for most stats; position and name read up. */
  ascFirst?: boolean;
}> = [
  { key: "played", label: "P", title: "Played", ascFirst: false },
  { key: "won", label: "W", title: "Won" },
  { key: "drawn", label: "D", title: "Drawn" },
  { key: "lost", label: "L", title: "Lost" },
  { key: "goalsFor", label: "GF", title: "Goals for" },
  { key: "goalsAgainst", label: "GA", title: "Goals against", ascFirst: true },
  { key: "goalDifference", label: "GD", title: "Goal difference" },
  { key: "points", label: "Pts", title: "Points" },
];

function SortLink({
  column,
  label,
  title,
  ascFirst,
  view,
}: {
  column: SortColumn;
  label: string;
  title: string;
  ascFirst?: boolean;
  view: ViewParams;
}) {
  const active = view.sort === column;
  // Clicking an inactive column starts in its natural direction; clicking the
  // active one reverses.
  const nextDirection = active
    ? view.direction === "asc"
      ? "desc"
      : "asc"
    : ascFirst
      ? "asc"
      : "desc";

  return (
    <Link
      href={viewHref(view, { sort: column, direction: nextDirection })}
      title={`${title} — sort ${nextDirection === "asc" ? "ascending" : "descending"}`}
      aria-sort={active ? (view.direction === "asc" ? "ascending" : "descending") : "none"}
      className={`inline-flex items-center gap-0.5 hover:text-ink ${
        active ? "text-ink" : ""
      }`}
    >
      {label}
      <span aria-hidden="true" className="w-2 text-[8px]">
        {active ? (view.direction === "asc" ? "▲" : "▼") : ""}
      </span>
    </Link>
  );
}

export function StandingsTable({
  rows,
  view,
}: {
  rows: TableRow[];
  view: ViewParams;
}) {
  if (rows.length === 0) return null;

  return (
    <div className="max-w-[880px] overflow-x-auto">
      <table className="zebra w-full min-w-[620px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-rule-strong">
            <th scope="col" className="label w-8 py-2 pr-2 text-right font-normal">
              #
            </th>
            <th scope="col" className="label py-2 text-left font-normal">
              <SortLink column="name" label="Club" title="Club name" ascFirst view={view} />
            </th>
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={`label w-10 py-2 text-right font-normal ${
                  col.key === "points" ? "pl-3" : ""
                }`}
              >
                <SortLink {...col} column={col.key} view={view} />
              </th>
            ))}
            <th scope="col" className="label hidden py-2 pl-4 text-left font-normal sm:table-cell">
              Last 5
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.teamId} className="border-b border-rule/60 last:border-0">
              <td className="py-[7px] pr-2 text-right text-[11px] text-ink-muted">{row.position}</td>
              <td className="py-[7px]">
                <Link
                  href={`/club/${row.slug}`}
                  className="inline-flex items-center gap-2 hover:underline"
                >
                  <ClubMark
                    primaryColor={row.primaryColor}
                    secondaryColor={row.secondaryColor}
                  />
                  <span className="truncate font-medium">{row.shortName}</span>
                </Link>
              </td>
              <td className="py-[7px] text-right text-ink-muted">{row.played}</td>
              <td className="py-[7px] text-right">{row.won}</td>
              <td className="py-[7px] text-right">{row.drawn}</td>
              <td className="py-[7px] text-right">{row.lost}</td>
              <td className="py-[7px] text-right">{row.goalsFor}</td>
              <td className="py-[7px] text-right">{row.goalsAgainst}</td>
              <td className="py-[7px] text-right font-medium">
                {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
              </td>
              <td className="py-[7px] pl-3 text-right text-[14px] font-semibold">{row.points}</td>
              <td className="hidden py-[7px] pl-4 sm:table-cell">
                <FormStrip form={row.form} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
