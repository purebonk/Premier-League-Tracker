import Link from "next/link";
import { notFound } from "next/navigation";
import { neonQueryable } from "@/db/queryable";
import { standings, streaks, headToHead, positionHistory } from "@/lib/stats";
import { findClubBySlug, clubMatches, nextFixture } from "@/lib/club";
import { clubTintStyle } from "@/lib/colors";
import { FormStrip } from "@/components/FormStrip";
import { MiniPositionLine } from "@/components/MiniPositionLine";

export const revalidate = 600;

const SEASON = 2025;

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "Europe/London",
});

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border border-rule bg-raised px-3 py-2">
      <div className="label">{label}</div>
      <div className="mt-1 text-[19px] font-semibold leading-none">{value}</div>
      {hint && <div className="mt-1 text-[11px] text-ink-muted">{hint}</div>}
    </div>
  );
}

function Section({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) {
  return (
    <section className="space-y-2">
      <h2 className="text-[13px] font-semibold">{title}</h2>
      {note && <p className="text-[12px] text-ink-muted">{note}</p>}
      {children}
    </section>
  );
}

function SplitTable({ rows }: { rows: Array<{ label: string; p: number; w: number; d: number; l: number; gf: number; ga: number; pts: number }> }) {
  return (
    <table className="w-full border-collapse text-[13px]">
      <thead>
        <tr className="border-b border-rule-strong">
          <th scope="col" className="label py-1.5 text-left font-normal">Split</th>
          {["P", "W", "D", "L", "GF", "GA", "Pts"].map((h) => (
            <th key={h} scope="col" className="label w-9 py-1.5 text-right font-normal">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className="border-b border-rule last:border-0">
            <td className="py-1.5">{r.label}</td>
            <td className="py-1.5 text-right text-ink-muted">{r.p}</td>
            <td className="py-1.5 text-right text-ink-muted">{r.w}</td>
            <td className="py-1.5 text-right text-ink-muted">{r.d}</td>
            <td className="py-1.5 text-right text-ink-muted">{r.l}</td>
            <td className="py-1.5 text-right text-ink-muted">{r.gf}</td>
            <td className="py-1.5 text-right text-ink-muted">{r.ga}</td>
            <td className="py-1.5 text-right font-semibold">{r.pts}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function ClubPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = neonQueryable();

  const club = await findClubBySlug(db, slug);
  if (!club) notFound();

  const [table, form, streakRows, results, history, upcoming, homeTable, awayTable] =
    await Promise.all([
      standings(db, { season: SEASON }),
      standings(db, { season: SEASON, lastN: 6 }),
      streaks(db, { season: SEASON }),
      clubMatches(db, { season: SEASON, teamId: club.id }),
      positionHistory(db, { season: SEASON }),
      nextFixture(db, { teamId: club.id }),
      standings(db, { season: SEASON, venue: "home" }),
      standings(db, { season: SEASON, venue: "away" }),
    ]);

  const row = table.find((r) => r.teamId === club.id);
  const formRow = form.find((r) => r.teamId === club.id);
  const streak = streakRows.find((r) => r.teamId === club.id);
  const home = homeTable.find((r) => r.teamId === club.id);
  const away = awayTable.find((r) => r.teamId === club.id);
  const line = history.filter((p) => p.teamId === club.id);

  const h2h = upcoming
    ? await headToHead(db, { teamAId: club.id, teamBId: upcoming.opponentId })
    : null;

  const played = results.filter((m) => m.outcome !== null);

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="club-tint inline-block h-7 w-[5px] rounded-[1px]"
            style={{ ...clubTintStyle(club.primaryColor, club.secondaryColor), background: "var(--club)" }}
          />
          <h1 className="text-[22px] font-semibold tracking-tight">{club.name}</h1>
        </div>
        <p className="text-[12px] text-ink-muted">
          2025/26 season ·{" "}
          <Link href="/" className="underline underline-offset-2 hover:text-ink">
            back to the table
          </Link>
        </p>
      </header>

      {row ? (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Position" value={`${row.position}`} hint={`of ${table.length}`} />
            <Stat label="Points" value={`${row.points}`} hint={`${row.played} played`} />
            <Stat
              label="Goal difference"
              value={row.goalDifference > 0 ? `+${row.goalDifference}` : `${row.goalDifference}`}
              hint={`${row.goalsFor} for, ${row.goalsAgainst} against`}
            />
            <Stat
              label="Form (last 6)"
              value={`${formRow?.points ?? 0} pts`}
              hint={formRow ? `${formRow.won}W ${formRow.drawn}D ${formRow.lost}L` : undefined}
            />
          </div>

          {streak && (
            <Section
              title="Current runs"
              note="Running as of the club's most recent match. A draw ends a winning run but extends an unbeaten one."
            >
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="Unbeaten" value={`${streak.unbeatenStreak}`} />
                <Stat label="Wins in a row" value={`${streak.winStreak}`} />
                <Stat label="Without a win" value={`${streak.winlessStreak}`} />
                <Stat label="Clean sheets" value={`${streak.cleanSheetStreak}`} />
              </div>
            </Section>
          )}

          <Section
            title="League position by matches played"
            note="Clubs are compared at equal games played, so a game in hand does not distort the line."
          >
            <div className="border border-rule bg-raised p-2">
              <MiniPositionLine
                points={line}
                primaryColor={club.primaryColor}
                secondaryColor={club.secondaryColor}
                clubs={table.length}
              />
            </div>
          </Section>

          {home && away && (
            <Section title="Home and away">
              <SplitTable
                rows={[
                  { label: "Home", p: home.played, w: home.won, d: home.drawn, l: home.lost, gf: home.goalsFor, ga: home.goalsAgainst, pts: home.points },
                  { label: "Away", p: away.played, w: away.won, d: away.drawn, l: away.lost, gf: away.goalsFor, ga: away.goalsAgainst, pts: away.points },
                ]}
              />
            </Section>
          )}
        </>
      ) : (
        <p className="border border-rule bg-raised px-4 py-3 text-[13px] text-ink-muted">
          {club.name} did not play in the Premier League in 2025/26.
        </p>
      )}

      {upcoming && h2h && (
        <Section
          title="Next fixture"
          note={`${upcoming.venue === "home" ? "Home to" : "Away to"} ${upcoming.opponentName}, ${dateFmt.format(upcoming.kicksOffAt)}.`}
        >
          <p className="text-[13px]">
            {h2h.played === 0 ? (
              <span className="text-ink-muted">No previous league meetings on record.</span>
            ) : (
              <>
                In {h2h.played} previous league meeting{h2h.played === 1 ? "" : "s"}:{" "}
                <strong className="font-semibold">{h2h.teamAWins}</strong> win
                {h2h.teamAWins === 1 ? "" : "s"} for {club.shortName},{" "}
                <strong className="font-semibold">{h2h.draws}</strong> draw
                {h2h.draws === 1 ? "" : "s"},{" "}
                <strong className="font-semibold">{h2h.teamBWins}</strong> for{" "}
                <Link href={`/club/${upcoming.opponentSlug}`} className="underline underline-offset-2">
                  {upcoming.opponentName}
                </Link>{" "}
                ({h2h.teamAGoals}–{h2h.teamBGoals} on goals).
              </>
            )}
          </p>
        </Section>
      )}

      {played.length > 0 && (
        <Section title={`Results (${played.length})`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-rule-strong">
                  <th scope="col" className="label w-8 py-1.5 text-right font-normal">MP</th>
                  <th scope="col" className="label w-14 py-1.5 text-left font-normal">Date</th>
                  <th scope="col" className="label w-8 py-1.5 text-left font-normal">H/A</th>
                  <th scope="col" className="label py-1.5 text-left font-normal">Opponent</th>
                  <th scope="col" className="label w-14 py-1.5 text-right font-normal">Score</th>
                  <th scope="col" className="label w-8 py-1.5 text-center font-normal">R</th>
                </tr>
              </thead>
              <tbody>
                {played.map((m) => (
                  <tr key={m.id} className="border-b border-rule last:border-0">
                    <td className="py-1.5 text-right text-ink-muted">{m.matchweek ?? "—"}</td>
                    <td className="py-1.5 text-ink-muted">{dateFmt.format(m.kicksOffAt)}</td>
                    <td className="py-1.5 text-ink-muted">{m.venue === "home" ? "H" : "A"}</td>
                    <td className="py-1.5">
                      <Link href={`/club/${m.opponentSlug}`} className="hover:underline">
                        {m.opponentName}
                      </Link>
                    </td>
                    <td className="py-1.5 text-right">
                      {m.goalsFor}&ndash;{m.goalsAgainst}
                    </td>
                    <td className="py-1.5 text-center">
                      <FormStrip form={m.outcome ?? ""} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  );
}
