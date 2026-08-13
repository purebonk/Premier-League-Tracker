/** Print derived stats against the real Neon data, for eyeballing. */
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { neonQueryable } = await import("../src/db/queryable");
  const { standings, streaks, positionHistory } = await import("../src/lib/stats");
  const db = neonQueryable();

  const table = await standings(db, { season: 2025 });
  console.log("2025/26 FINAL TABLE");
  console.table(
    table.map((r) => ({
      "#": r.position, club: r.shortName, P: r.played, W: r.won, D: r.drawn,
      L: r.lost, GF: r.goalsFor, GA: r.goalsAgainst, GD: r.goalDifference, Pts: r.points,
    })),
  );

  const totals = table.reduce(
    (acc, r) => ({
      played: acc.played + r.played,
      gf: acc.gf + r.goalsFor,
      ga: acc.ga + r.goalsAgainst,
      gd: acc.gd + r.goalDifference,
    }),
    { played: 0, gf: 0, ga: 0, gd: 0 },
  );
  console.log("integrity:", {
    clubs: table.length,
    clubMatches: totals.played,
    goalsFor: totals.gf,
    goalsAgainst: totals.ga,
    goalDifferenceSum: totals.gd,
  });

  const mid = await standings(db, { season: 2025, uptoMatch: 19 });
  console.log("\nTOP 5 AFTER MATCHWEEK 19 (halfway)");
  console.table(mid.slice(0, 5).map((r) => ({ "#": r.position, club: r.shortName, Pts: r.points })));

  const f = await standings(db, { season: 2025, lastN: 6 });
  console.log("\nFORM TABLE, LAST 6 (top 5)");
  console.table(f.slice(0, 5).map((r) => ({ "#": r.position, club: r.shortName, form: r.form, Pts: r.points })));

  const s = await streaks(db, { season: 2025 });
  console.log("\nLONGEST CURRENT UNBEATEN RUNS AT SEASON END");
  console.table(
    [...s].sort((a, b) => b.unbeatenStreak - a.unbeatenStreak).slice(0, 5)
      .map((r) => ({ club: r.shortName, unbeaten: r.unbeatenStreak, wins: r.winStreak, winless: r.winlessStreak, cleanSheets: r.cleanSheetStreak })),
  );

  const [home, away] = await Promise.all([
    standings(db, { season: 2025, venue: "home" }),
    standings(db, { season: 2025, venue: "away" }),
  ]);
  console.log("\nHOME-ONLY vs AWAY-ONLY (top 5 of each)");
  console.table(
    home.slice(0, 5).map((r, i) => ({
      home: `${r.position}. ${r.shortName} (${r.points})`,
      away: `${away[i].position}. ${away[i].shortName} (${away[i].points})`,
    })),
  );
  console.log("split check — home played + away played === total played:", {
    home: home.reduce((n, r) => n + r.played, 0),
    away: away.reduce((n, r) => n + r.played, 0),
    total: table.reduce((n, r) => n + r.played, 0),
  });

  const topSix = table.slice(0, 6).map((r) => r.teamId);
  const mini = await standings(db, { season: 2025, opponents: topSix });
  console.log("\nTOP-SIX MINI-LEAGUE (only matches between the top six)");
  console.table(
    mini.map((r) => ({
      "#": r.position, club: r.shortName, P: r.played, W: r.won, D: r.drawn,
      L: r.lost, GD: r.goalDifference, Pts: r.points, form: r.form,
    })),
  );

  const hist = await positionHistory(db, { season: 2025 });
  console.log("\nposition history points:", hist.length, "(expect 20 clubs x 38 weeks = 760)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
