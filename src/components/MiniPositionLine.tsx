import type { PositionPoint } from "@/lib/stats";

/**
 * One club's position across the season, as a static SVG. No interaction here
 * — the full interactive chart lives on /history; this is a sparkline that
 * happens to be a league position, so it is inverted the same way.
 */
export function MiniPositionLine({
  points,
  color,
  clubs = 20,
}: {
  points: PositionPoint[];
  color: string;
  clubs?: number;
}) {
  if (points.length < 2) return null;

  const width = 640;
  const height = 130;
  const padX = 22;
  const padY = 12;
  const weeks = Math.max(...points.map((p) => p.matchweek));

  const x = (week: number) =>
    padX + ((week - 1) / Math.max(1, weeks - 1)) * (width - padX * 2);
  // Inverted: 1st at the top.
  const y = (position: number) =>
    padY + ((position - 1) / Math.max(1, clubs - 1)) * (height - padY * 2);

  const path = points
    .slice()
    .sort((a, b) => a.matchweek - b.matchweek)
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.matchweek).toFixed(1)},${y(p.position).toFixed(1)}`)
    .join(" ");

  const last = points[points.length - 1];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full"
      role="img"
      aria-label={`League position by matches played, finishing ${last.position}`}
    >
      {[1, 4, 10, 17, clubs].map((pos) => (
        <line
          key={pos}
          x1={padX}
          x2={width - padX}
          y1={y(pos)}
          y2={y(pos)}
          stroke="var(--color-rule)"
          strokeWidth="1"
        />
      ))}
      {[1, 4, 10, 17, clubs].map((pos) => (
        <text
          key={`l-${pos}`}
          x={4}
          y={y(pos) + 3}
          fontSize="8"
          fill="var(--color-ink-faint)"
        >
          {pos}
        </text>
      ))}
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      <circle cx={x(last.matchweek)} cy={y(last.position)} r="3" fill={color} />
    </svg>
  );
}
