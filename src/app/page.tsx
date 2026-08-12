import { recentResults, upcomingFixtures, type MatchRow } from "@/lib/queries";

// Read from Postgres on every request for now. Phase 4 adds caching, and the
// numbers only mean something if we measure the uncached baseline first.
export const dynamic = "force-dynamic";

const ukTime = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/London",
});

function Crest({ url, name }: { url: string | null; name: string }) {
  if (!url) return <div className="size-6 rounded-full bg-white/10" />;
  // eslint-disable-next-line @next/next/no-img-element -- ESPN CDN, no loader configured
  return <img src={url} alt="" width={24} height={24} className="size-6 object-contain" title={name} />;
}

function Side({ name, crest, align }: { name: string; crest: string | null; align: "left" | "right" }) {
  return (
    <div
      className={`flex min-w-0 flex-1 items-center gap-2 ${
        align === "right" ? "flex-row-reverse text-right" : ""
      }`}
    >
      <Crest url={crest} name={name} />
      <span className="truncate text-sm text-white/90">{name}</span>
    </div>
  );
}

function Score({ match }: { match: MatchRow }) {
  if (match.status === "finished" || match.status === "live") {
    return (
      <div className="flex shrink-0 flex-col items-center px-3">
        <span className="tabular-nums text-sm font-semibold text-white">
          {match.homeGoals ?? 0} &ndash; {match.awayGoals ?? 0}
        </span>
        {match.status === "live" && (
          <span className="text-[10px] font-medium text-emerald-400">
            {match.minute ?? 0}
            {match.stoppageMinute ? `+${match.stoppageMinute}` : ""}&prime;
          </span>
        )}
      </div>
    );
  }
  return (
    <div className="shrink-0 px-3 text-center text-[11px] leading-tight text-white/40">
      {ukTime.format(match.kicksOffAt)}
    </div>
  );
}

function MatchList({ matches }: { matches: MatchRow[] }) {
  if (matches.length === 0) {
    return <p className="px-4 py-6 text-sm text-white/40">No matches yet.</p>;
  }
  return (
    <ul className="divide-y divide-white/5">
      {matches.map((m) => (
        <li key={m.id} className="flex items-center px-4 py-2.5">
          <Side name={m.homeName} crest={m.homeCrest} align="left" />
          <Score match={m} />
          <Side name={m.awayName} crest={m.awayCrest} align="right" />
        </li>
      ))}
    </ul>
  );
}

function Panel({ title, subtitle, children }: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
      <header className="border-b border-white/10 px-4 py-3">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        <p className="text-xs text-white/40">{subtitle}</p>
      </header>
      {children}
    </section>
  );
}

export default async function Home() {
  // Server Component: this runs on the server only, so it can query Postgres
  // directly and ship plain HTML. The connection string never reaches the browser.
  const [results, fixtures] = await Promise.all([
    recentResults(10),
    upcomingFixtures(10),
  ]);

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          Premier League Tracker
        </h1>
        <p className="mt-1 text-sm text-white/50">
          Match data ingested from ESPN on a schedule into Postgres. Reads are
          served from our own database, never proxied live.
        </p>
      </header>

      <div className="grid gap-5 sm:grid-cols-2">
        <Panel title="Latest results" subtitle="Most recent completed matches">
          <MatchList matches={results} />
        </Panel>
        <Panel title="Upcoming fixtures" subtitle="Next scheduled kickoffs">
          <MatchList matches={fixtures} />
        </Panel>
      </div>
    </main>
  );
}
