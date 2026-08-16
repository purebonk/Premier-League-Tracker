"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

/**
 * Client component, deliberately.
 *
 * The league table is zero-JS because every filter maps cleanly to a URL. A
 * scrubber does not: dragging through 38 matchweeks is continuous state that
 * would mean a server round trip per frame. So the interaction lives here and
 * the page around it stays server-rendered — the data arrives already
 * computed, and this component only decides what to draw.
 */

export interface ChartClub {
  teamId: number;
  name: string;
  shortName: string;
  slug: string;
  color: string;
}

export interface ChartPoint {
  matchweek: number;
  teamId: number;
  position: number;
  points: number;
  goalDifference: number;
}

const WIDTH = 900;
const HEIGHT = 460;
const PAD = { top: 16, right: 16, bottom: 34, left: 30 };

export function PositionChart({
  clubs,
  points,
  weeks,
}: {
  clubs: ChartClub[];
  points: ChartPoint[];
  weeks: number;
}) {
  const [week, setWeek] = useState(weeks);
  const [hovered, setHovered] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);

  const focused = hovered ?? pinned;
  const clubCount = clubs.length;

  const byClub = useMemo(() => {
    const map = new Map<number, ChartPoint[]>();
    for (const p of points) {
      const list = map.get(p.teamId);
      if (list) list.push(p);
      else map.set(p.teamId, [p]);
    }
    for (const list of map.values()) list.sort((a, b) => a.matchweek - b.matchweek);
    return map;
  }, [points]);

  const standingsAtWeek = useMemo(
    () =>
      points
        .filter((p) => p.matchweek === week)
        .sort((a, b) => a.position - b.position),
    [points, week],
  );

  const x = (w: number) =>
    PAD.left + ((w - 1) / Math.max(1, weeks - 1)) * (WIDTH - PAD.left - PAD.right);
  // Inverted: first place at the top.
  const y = (position: number) =>
    PAD.top + ((position - 1) / Math.max(1, clubCount - 1)) * (HEIGHT - PAD.top - PAD.bottom);

  const pathFor = (teamId: number) =>
    (byClub.get(teamId) ?? [])
      .filter((p) => p.matchweek <= week)
      .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.matchweek).toFixed(1)},${y(p.position).toFixed(1)}`)
      .join(" ");

  const clubById = useMemo(
    () => new Map(clubs.map((c) => [c.teamId, c])),
    [clubs],
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0 space-y-3">
          <div className="border border-rule bg-raised p-2">
            <svg
              viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              className="h-auto w-full touch-none"
              role="img"
              aria-label={`League position by matches played through match ${week}. Use the slider below to move through the season.`}
              onMouseLeave={() => setHovered(null)}
            >
              {[1, 4, 5, 10, 15, 17, clubCount].map((pos) => (
                <g key={pos}>
                  <line
                    x1={PAD.left}
                    x2={WIDTH - PAD.right}
                    y1={y(pos)}
                    y2={y(pos)}
                    stroke="var(--color-rule)"
                    strokeWidth={pos === 4 || pos === 17 ? 1.5 : 1}
                    strokeDasharray={pos === 4 || pos === 17 ? "4 3" : undefined}
                  />
                  <text x={4} y={y(pos) + 3} fontSize="9" fill="var(--color-ink-faint)">
                    {pos}
                  </text>
                </g>
              ))}

              {[1, 10, 20, 30, weeks].map((w) => (
                <text
                  key={w}
                  x={x(w)}
                  y={HEIGHT - 14}
                  fontSize="9"
                  textAnchor="middle"
                  fill="var(--color-ink-faint)"
                >
                  {w}
                </text>
              ))}
              <text
                x={(WIDTH - PAD.left) / 2}
                y={HEIGHT - 2}
                fontSize="9"
                textAnchor="middle"
                fill="var(--color-ink-muted)"
              >
                Matches played
              </text>

              {clubs.map((club) => {
                const isFocused = focused === club.teamId;
                const dimmed = focused !== null && !isFocused;
                return (
                  <g key={club.teamId}>
                    {/* Wide invisible stroke gives the thin line a usable hit area. */}
                    <path
                      d={pathFor(club.teamId)}
                      fill="none"
                      stroke="transparent"
                      strokeWidth="12"
                      style={{ cursor: "pointer" }}
                      onMouseEnter={() => setHovered(club.teamId)}
                      onClick={() =>
                        setPinned((p) => (p === club.teamId ? null : club.teamId))
                      }
                    />
                    <path
                      d={pathFor(club.teamId)}
                      fill="none"
                      stroke={club.color}
                      strokeWidth={isFocused ? 2.75 : 1.5}
                      strokeOpacity={dimmed ? 0.16 : 1}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      pointerEvents="none"
                    />
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="flex items-center gap-3">
            <label htmlFor="scrubber" className="label shrink-0">
              Match {week}
            </label>
            {/* A range input is draggable and arrow-key operable for free. */}
            <input
              id="scrubber"
              type="range"
              min={1}
              max={weeks}
              value={week}
              onChange={(e) => setWeek(Number(e.target.value))}
              className="h-1 w-full cursor-pointer appearance-none rounded bg-rule accent-ink"
              aria-valuetext={`After ${week} matches played`}
            />
          </div>

          <p className="text-[12px] leading-relaxed text-ink-muted">
            The axis is <strong className="font-medium text-ink">matches played</strong>,
            not the official matchweek: clubs are compared once each has played
            the same number of games, so a side with a game in hand does not
            appear artificially low.{" "}
            {focused !== null && (
              <>
                Showing{" "}
                <Link
                  href={`/club/${clubById.get(focused)?.slug}`}
                  className="underline underline-offset-2 hover:text-ink"
                >
                  {clubById.get(focused)?.name}
                </Link>
                . Click the line again to release it.
              </>
            )}
          </p>
        </div>

        <div className="min-w-0">
          <div className="label mb-2">Table after {week}</div>
          <ol className="space-y-0">
            {standingsAtWeek.map((p) => {
              const club = clubById.get(p.teamId);
              if (!club) return null;
              const isFocused = focused === p.teamId;
              return (
                <li
                  key={p.teamId}
                  onMouseEnter={() => setHovered(p.teamId)}
                  onMouseLeave={() => setHovered(null)}
                  className={`flex items-center gap-2 border-b border-rule py-[3px] text-[12px] last:border-0 ${
                    isFocused ? "bg-ground" : ""
                  }`}
                >
                  <span className="w-4 text-right text-ink-muted">{p.position}</span>
                  <span
                    aria-hidden="true"
                    className="inline-block h-3 w-[3px] shrink-0 rounded-[1px]"
                    style={{ backgroundColor: club.color }}
                  />
                  <Link href={`/club/${club.slug}`} className="min-w-0 flex-1 truncate hover:underline">
                    {club.shortName}
                  </Link>
                  <span className="w-6 text-right font-semibold">{p.points}</span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}
