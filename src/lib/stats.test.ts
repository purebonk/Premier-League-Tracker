import { describe, it, expect, beforeAll } from "vitest";
import { createTestDb, seed, type TestDb, type FixtureMatch } from "./test-support/pg";
import {
  standings,
  streaks,
  headToHead,
  positionHistory,
  latestSeasonWithResults,
} from "./stats";

/**
 * A four-club mini-league whose every value is computable by hand, so the
 * assertions state what the football should be rather than echoing whatever
 * the query returned.
 *
 * Deliberately includes: a drawn match, a goalless draw, a postponed fixture,
 * two clubs level on every tiebreaker, and (in 2026) a promoted club with no
 * prior-season history.
 *
 *   MW1  Ashford  1-0 Brantley      Colwyn 1-0 Denham
 *   MW2  Ashford  2-2 Colwyn        Brantley 0-0 Denham     (draws)
 *   MW3  Colwyn   3-0 Denham        Ashford  -  Brantley    (POSTPONED)
 *   MW4  Ashford  0-1 Colwyn        Brantley 2-1 Denham
 *
 * Final: Colwyn 10pts; Ashford and Brantley both 4pts and GD 0, split by
 * goals scored (3 v 2); Denham 1pt.
 */
const CLUBS = ["Ashford", "Brantley", "Colwyn", "Denham", "Eastvale"];

const FIXTURES: FixtureMatch[] = [
  { home: "Ashford", away: "Brantley", homeGoals: 1, awayGoals: 0, kickoff: "2025-08-01T14:00:00Z" },
  { home: "Colwyn", away: "Denham", homeGoals: 1, awayGoals: 0, kickoff: "2025-08-01T14:00:00Z" },

  { home: "Ashford", away: "Colwyn", homeGoals: 2, awayGoals: 2, kickoff: "2025-08-08T14:00:00Z" },
  { home: "Brantley", away: "Denham", homeGoals: 0, awayGoals: 0, kickoff: "2025-08-08T14:00:00Z" },

  { home: "Colwyn", away: "Denham", homeGoals: 3, awayGoals: 0, kickoff: "2025-08-15T14:00:00Z" },
  // Postponed: no result, must not contribute to any standing.
  { home: "Ashford", away: "Brantley", homeGoals: null, awayGoals: null, kickoff: "2025-08-15T14:00:00Z", status: "postponed" },

  { home: "Ashford", away: "Colwyn", homeGoals: 0, awayGoals: 1, kickoff: "2025-08-22T14:00:00Z" },
  { home: "Brantley", away: "Denham", homeGoals: 2, awayGoals: 1, kickoff: "2025-08-22T14:00:00Z" },

  // 2026/27: a promoted club with no 2025/26 history at all.
  { home: "Eastvale", away: "Ashford", homeGoals: 2, awayGoals: 0, kickoff: "2026-08-01T14:00:00Z", season: 2026 },
];

let db: TestDb;
let ids: Map<string, number>;

beforeAll(async () => {
  db = await createTestDb();
  ids = await seed(db, CLUBS, FIXTURES);
});

describe("matchweek derivation", () => {
  it("assigns the later-playing club's match number", async () => {
    const rows = await db.query<{ matchweek: number; n: string }>(
      `select matchweek, count(*)::text as n from derived_matchweeks
       where season = 2025 group by matchweek order by matchweek`,
      [],
    );
    expect(rows.map((r) => [r.matchweek, Number(r.n)])).toEqual([
      [1, 2],
      [2, 2],
      [3, 2],
      [4, 2],
    ]);
  });

  it("counts a postponed fixture toward the sequence but not the standings", async () => {
    // The postponed Ashford v Brantley still occupies matchweek 3 -- it is a
    // real fixture that will be played -- yet contributes no points.
    const [row] = await db.query<{ matchweek: number; status: string }>(
      `select d.matchweek, m.status from derived_matchweeks d
       join matches m on m.id = d.id where m.status = 'postponed'`,
      [],
    );
    expect(row.matchweek).toBe(3);

    const table = await standings(db, { season: 2025 });
    const ashford = table.find((r) => r.name === "Ashford")!;
    expect(ashford.played).toBe(3); // 4 fixtures, one postponed
  });
});

describe("standings", () => {
  it("orders by points, then goal difference, then goals scored", async () => {
    const table = await standings(db, { season: 2025 });

    expect(table.map((r) => r.name)).toEqual([
      "Colwyn",
      "Ashford",
      "Brantley",
      "Denham",
    ]);

    const colwyn = table[0];
    expect(colwyn).toMatchObject({
      position: 1, played: 4, won: 3, drawn: 1, lost: 0,
      goalsFor: 7, goalsAgainst: 2, goalDifference: 5, points: 10,
    });

    // Ashford and Brantley are level on points (4) and goal difference (0);
    // only goals scored separates them, 3 to 2.
    const [ashford, brantley] = [table[1], table[2]];
    expect(ashford.points).toBe(brantley.points);
    expect(ashford.goalDifference).toBe(brantley.goalDifference);
    expect(ashford.goalsFor).toBe(3);
    expect(brantley.goalsFor).toBe(2);
  });

  it("counts a draw as a point for both clubs, not a win for neither", async () => {
    const table = await standings(db, { season: 2025 });
    const denham = table.find((r) => r.name === "Denham")!;
    // Denham: one goalless draw, three defeats.
    expect(denham).toMatchObject({ played: 4, won: 0, drawn: 1, lost: 3, points: 1 });
  });

  it("falls back to club name when clubs are level on every tiebreaker", async () => {
    // After matchweek 1: Ashford and Colwyn both won 1-0, so they match on
    // points, goal difference and goals scored. Brantley and Denham likewise.
    const table = await standings(db, { season: 2025, uptoMatch: 1 });

    expect(table.map((r) => r.name)).toEqual([
      "Ashford",
      "Colwyn",
      "Brantley",
      "Denham",
    ]);
    expect(table[0].points).toBe(table[1].points);
    expect(table[0].goalDifference).toBe(table[1].goalDifference);
    expect(table[0].goalsFor).toBe(table[1].goalsFor);
  });

  it("rewinds to the table as it stood after a given matchweek", async () => {
    const afterTwo = await standings(db, { season: 2025, uptoMatch: 2 });
    const colwyn = afterTwo.find((r) => r.name === "Colwyn")!;
    expect(colwyn).toMatchObject({ played: 2, won: 1, drawn: 1, points: 4 });

    // No club may show more games played than the matchweek requested.
    for (const row of afterTwo) expect(row.played).toBeLessThanOrEqual(2);
  });

  it("balances: every goal scored is a goal conceded, so GD sums to zero", async () => {
    // A closed league has to balance. If the lateral join ever double-counted a
    // club or dropped a side of a fixture, these two totals would diverge --
    // which is far easier to catch here than by eyeballing a table.
    const table = await standings(db, { season: 2025 });
    const goalsFor = table.reduce((n, r) => n + r.goalsFor, 0);
    const goalsAgainst = table.reduce((n, r) => n + r.goalsAgainst, 0);
    const goalDifference = table.reduce((n, r) => n + r.goalDifference, 0);

    expect(goalsFor).toBe(goalsAgainst);
    expect(goalDifference).toBe(0);
    // 7 finished fixtures, two clubs each.
    expect(table.reduce((n, r) => n + r.played, 0)).toBe(14);
  });

  it("excludes a promoted club from the season before it was promoted", async () => {
    const y2025 = await standings(db, { season: 2025 });
    expect(y2025.map((r) => r.name)).not.toContain("Eastvale");

    const y2026 = await standings(db, { season: 2026 });
    expect(y2026.map((r) => r.name)).toContain("Eastvale");
    expect(y2026.find((r) => r.name === "Eastvale")).toMatchObject({
      position: 1, played: 1, won: 1, points: 3,
    });
  });
});

describe("standings: lastN (form)", () => {
  it("lists results most recent first", async () => {
    const form = await standings(db, { season: 2025, lastN: 6 });
    expect(form.find((r) => r.name === "Ashford")!.form).toBe("L D W");
    expect(form.find((r) => r.name === "Colwyn")!.form).toBe("W W D W");
  });

  it("limits each club to its own last N matches", async () => {
    const form = await standings(db, { season: 2025, lastN: 2 });
    const colwyn = form.find((r) => r.name === "Colwyn")!;
    expect(colwyn.played).toBe(2);
    expect(colwyn.form).toBe("W W");
    // Last two only: two wins, so 6 points rather than his full-season 10.
    expect(colwyn.points).toBe(6);
  });
});

describe("standings: venue", () => {
  it("counts only home matches, and drops a club that never played at home", async () => {
    const table = await standings(db, { season: 2025, venue: "home" });

    // Denham is away in every fixture, so it has no rows to aggregate at all.
    expect(table.map((r) => r.name)).toEqual(["Colwyn", "Brantley", "Ashford"]);

    expect(table.find((r) => r.name === "Colwyn")).toMatchObject({
      played: 2, won: 2, goalsFor: 4, goalsAgainst: 0, points: 6,
    });
    // Ashford at home: W 1-0, D 2-2, L 0-1.
    expect(table.find((r) => r.name === "Ashford")).toMatchObject({
      played: 3, won: 1, drawn: 1, lost: 1, goalsFor: 3, goalsAgainst: 3, points: 4,
    });
  });

  it("counts only away matches, flipping goals for and against", async () => {
    const table = await standings(db, { season: 2025, venue: "away" });

    expect(table.map((r) => r.name)).toEqual(["Colwyn", "Denham", "Brantley"]);
    // Denham away: L 0-1, D 0-0, L 0-3, L 1-2.
    expect(table.find((r) => r.name === "Denham")).toMatchObject({
      played: 4, won: 0, drawn: 1, lost: 3, goalsFor: 1, goalsAgainst: 6, points: 1,
    });
  });

  it("splits a season cleanly: home played plus away played equals the total", async () => {
    const [all, home, away] = await Promise.all([
      standings(db, { season: 2025 }),
      standings(db, { season: 2025, venue: "home" }),
      standings(db, { season: 2025, venue: "away" }),
    ]);
    const total = (rows: typeof all) => rows.reduce((n, r) => n + r.played, 0);
    expect(total(home) + total(away)).toBe(total(all));
  });
});

describe("standings: opponents", () => {
  it("requires BOTH clubs in the set, not just one", async () => {
    const mini = await standings(db, {
      season: 2025,
      opponents: [ids.get("Ashford")!, ids.get("Colwyn")!],
    });

    // Only the two Ashford v Colwyn meetings qualify. Ashford v Brantley is
    // excluded even though Ashford is in the set -- that is the difference
    // between a mini-league and "matches involving these clubs".
    expect(mini.map((r) => r.name)).toEqual(["Colwyn", "Ashford"]);
    expect(mini.find((r) => r.name === "Colwyn")).toMatchObject({
      played: 2, won: 1, drawn: 1, lost: 0, points: 4,
    });
    expect(mini.find((r) => r.name === "Ashford")).toMatchObject({
      played: 2, won: 0, drawn: 1, lost: 1, points: 1,
    });
  });

  it("treats an empty set as no filter", async () => {
    const [none, all] = await Promise.all([
      standings(db, { season: 2025, opponents: [] }),
      standings(db, { season: 2025 }),
    ]);
    expect(none).toEqual(all);
  });
});

describe("standings: sort", () => {
  it("reorders rows without renumbering the league", async () => {
    const byName = await standings(db, {
      season: 2025,
      sort: { column: "name", direction: "asc" },
    });

    expect(byName.map((r) => r.name)).toEqual([
      "Ashford", "Brantley", "Colwyn", "Denham",
    ]);
    // Position stays the canonical league rank: Colwyn is still 1st.
    expect(byName.find((r) => r.name === "Colwyn")!.position).toBe(1);
    expect(byName.find((r) => r.name === "Ashford")!.position).toBe(2);
  });

  it("breaks sort ties with the canonical order", async () => {
    // Colwyn and Brantley have both conceded 2; Colwyn leads on points.
    const byConceded = await standings(db, {
      season: 2025,
      sort: { column: "goalsAgainst", direction: "asc" },
    });
    expect(byConceded.map((r) => r.name)).toEqual([
      "Colwyn", "Brantley", "Ashford", "Denham",
    ]);
  });

  it("never lets an unknown sort column reach the database", async () => {
    const rows = await standings(db, {
      season: 2025,
      sort: { column: "; drop table teams --" as never, direction: "desc" },
    });

    // The column falls back to `position`; the requested direction is still
    // honoured, so this is the league in reverse rather than an error.
    expect(rows.map((r) => r.name)).toEqual([
      "Denham", "Brantley", "Ashford", "Colwyn",
    ]);

    // The payload was never interpolated: the table it tried to drop is fine.
    const [{ n }] = await db.query<{ n: string }>(
      "select count(*)::text as n from teams",
      [],
    );
    expect(Number(n)).toBe(5);
  });
});

describe("standings: parameters combined", () => {
  it("applies venue, recency and sort together", async () => {
    // Home matches only, each club's last two of those, weakest first.
    const rows = await standings(db, {
      season: 2025,
      venue: "home",
      lastN: 2,
      sort: { column: "points", direction: "asc" },
    });

    expect(rows.map((r) => r.name)).toEqual(["Ashford", "Brantley", "Colwyn"]);

    // Ashford's last two home matches were L 0-1 then D 2-2.
    expect(rows.find((r) => r.name === "Ashford")).toMatchObject({
      played: 2, drawn: 1, lost: 1, points: 1, form: "L D",
    });
    expect(rows.find((r) => r.name === "Colwyn")).toMatchObject({
      played: 2, won: 2, points: 6, form: "W W",
    });
    // Canonical position survives the ascending sort.
    expect(rows.find((r) => r.name === "Colwyn")!.position).toBe(1);
  });

  it("recency applies after the venue filter, not before it", async () => {
    // Ashford's last two matches overall are L (away-less fixture list aside)
    // and D; its last two HOME matches are the same here, but Colwyn differs:
    // last two overall include the 2-2 draw, last two at home are both wins.
    const home = await standings(db, { season: 2025, venue: "home", lastN: 2 });
    const overall = await standings(db, { season: 2025, lastN: 2 });

    expect(home.find((r) => r.name === "Colwyn")!.form).toBe("W W");
    expect(overall.find((r) => r.name === "Colwyn")!.form).toBe("W W");
    // Denham has home matches: none. So it is absent from one and present in
    // the other, which only holds if the venue predicate ran first.
    expect(home.map((r) => r.name)).not.toContain("Denham");
    expect(overall.map((r) => r.name)).toContain("Denham");
  });
});

describe("latestSeasonWithResults", () => {
  it("returns the newest season that actually has results", async () => {
    // 2026 exists in the fixtures and has one finished match.
    expect(await latestSeasonWithResults(db)).toBe(2026);
  });

  it("returns null for a competition with nothing played", async () => {
    expect(await latestSeasonWithResults(db, "esp.1")).toBeNull();
  });
});

describe("streaks", () => {
  it("treats a draw as ending a winning run but not an unbeaten one", async () => {
    const rows = await streaks(db, { season: 2025 });
    const brantley = rows.find((r) => r.name === "Brantley")!;

    // Brantley, most recent first: W (2-1), D (0-0), L (0-1).
    expect(brantley.winStreak).toBe(1); // the draw stops it at one
    expect(brantley.unbeatenStreak).toBe(2); // win + draw both survive
    expect(brantley.winlessStreak).toBe(0); // most recent match was a win
  });

  it("counts an unbeaten run through a draw", async () => {
    const rows = await streaks(db, { season: 2025 });
    const colwyn = rows.find((r) => r.name === "Colwyn")!;

    // Colwyn, most recent first: W, W, D, W -- never beaten.
    expect(colwyn.winStreak).toBe(2); // stopped by the draw
    expect(colwyn.unbeatenStreak).toBe(4); // whole season
    expect(colwyn.cleanSheetStreak).toBe(2); // the 2-2 broke it
  });

  it("counts a winless run through draws as well as defeats", async () => {
    const rows = await streaks(db, { season: 2025 });
    const denham = rows.find((r) => r.name === "Denham")!;

    // Denham: L, L, D, L -- a draw is still not a win.
    expect(denham.winlessStreak).toBe(4);
    expect(denham.winStreak).toBe(0);
    expect(denham.unbeatenStreak).toBe(0);
  });

  it("reports zero rather than null when the most recent match breaks the run", async () => {
    const rows = await streaks(db, { season: 2025 });
    const ashford = rows.find((r) => r.name === "Ashford")!;
    expect(ashford.winStreak).toBe(0);
    expect(ashford.unbeatenStreak).toBe(0);
    expect(ashford.winlessStreak).toBe(2);
  });
});

describe("headToHead", () => {
  it("normalises the record to the first club's perspective", async () => {
    const h2h = await headToHead(db, {
      teamAId: ids.get("Ashford")!,
      teamBId: ids.get("Colwyn")!,
    });

    // Two meetings: 2-2 draw, then Ashford 0-1 Colwyn.
    expect(h2h.played).toBe(2);
    expect(h2h.teamAWins).toBe(0);
    expect(h2h.draws).toBe(1);
    expect(h2h.teamBWins).toBe(1);
    expect(h2h.teamAGoals).toBe(2);
    expect(h2h.teamBGoals).toBe(3);
  });

  it("returns meetings newest first and ignores unplayed fixtures", async () => {
    const h2h = await headToHead(db, {
      teamAId: ids.get("Ashford")!,
      teamBId: ids.get("Brantley")!,
    });
    // Their only other fixture was postponed, so just the opening 1-0.
    expect(h2h.played).toBe(1);
    expect(h2h.meetings).toHaveLength(1);
    expect(h2h.meetings[0].homeGoals).toBe(1);
  });

  it("returns an empty record for clubs that have never met", async () => {
    const h2h = await headToHead(db, {
      teamAId: ids.get("Eastvale")!,
      teamBId: ids.get("Denham")!,
    });
    expect(h2h.played).toBe(0);
    expect(h2h.meetings).toEqual([]);
  });
});

describe("positionHistory", () => {
  it("returns every club's position at every matchweek", async () => {
    const points = await positionHistory(db, { season: 2025 });
    expect(points.filter((p) => p.matchweek === 1)).toHaveLength(4);
    expect(new Set(points.map((p) => p.matchweek))).toEqual(new Set([1, 2, 3, 4]));
  });

  it("agrees with the table query at every matchweek", async () => {
    // The chart and the table must never disagree -- they are the same
    // ordering, so a divergence means one of them is wrong.
    const history = await positionHistory(db, { season: 2025 });
    for (const week of [1, 2, 3, 4]) {
      const table = await standings(db, { season: 2025, uptoMatch: week });
      const fromHistory = history
        .filter((p) => p.matchweek === week)
        .sort((a, b) => a.position - b.position)
        .map((p) => p.teamId);
      expect(fromHistory).toEqual(table.map((r) => r.teamId));
    }
  });

  it("tracks a club climbing the table", async () => {
    const history = await positionHistory(db, { season: 2025 });
    const colwyn = ids.get("Colwyn")!;
    const at = (w: number) =>
      history.find((p) => p.matchweek === w && p.teamId === colwyn)!;

    expect(at(1).position).toBe(2); // level with Ashford, behind on name
    expect(at(4).position).toBe(1); // clear at the top by the end
    expect(at(4).points).toBe(10);
  });
});
