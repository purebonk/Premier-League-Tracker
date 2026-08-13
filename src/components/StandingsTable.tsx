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
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-[13px]">
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
            <tr key={row.teamId} className="border-b border-rule last:border-0">
              <td className="py-1.5 pr-2 text-right text-ink-muted">{row.position}</td>
              <td className="py-1.5">
                <Link
                  href={`/club/${row.slug}`}
                  className="inline-flex items-center gap-2 hover:underline"
                >
                  <ClubMark
                    primaryColor={row.primaryColor}
                    secondaryColor={row.secondaryColor}
                  />
                  <span className="truncate">{row.shortName}</span>
                </Link>
              </td>
              <td className="py-1.5 text-right text-ink-muted">{row.played}</td>
              <td className="py-1.5 text-right text-ink-muted">{row.won}</td>
              <td className="py-1.5 text-right text-ink-muted">{row.drawn}</td>
              <td className="py-1.5 text-right text-ink-muted">{row.lost}</td>
              <td className="py-1.5 text-right text-ink-muted">{row.goalsFor}</td>
              <td className="py-1.5 text-right text-ink-muted">{row.goalsAgainst}</td>
              <td className="py-1.5 text-right text-ink-muted">
                {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
              </td>
              <td className="py-1.5 pl-3 text-right font-semibold">{row.points}</td>
              <td className="hidden py-1.5 pl-4 sm:table-cell">
                <FormStrip form={row.form} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
