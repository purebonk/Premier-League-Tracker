import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Clubs. `externalId` is ESPN's team id and is the natural key we upsert on,
 * so re-running ingest never creates a duplicate club.
 */
export const teams = pgTable(
  "teams",
  {
    id: serial("id").primaryKey(),
    externalId: text("external_id").notNull(),
    name: text("name").notNull(),
    shortName: text("short_name").notNull(),
    crestUrl: text("crest_url"),
  },
  (t) => [uniqueIndex("teams_external_id_idx").on(t.externalId)],
);

/**
 * Normalized match status. ESPN ships a wide STATUS_* vocabulary that mixes
 * lifecycle with presentation (STATUS_HALFTIME, STATUS_FULL_TIME, ...).
 * We collapse it to the five states that actually change how a match is
 * read or aggregated, so the table/form queries never branch on ESPN strings.
 */
export const MATCH_STATUSES = [
  "scheduled",
  "live",
  "finished",
  "postponed",
  "cancelled",
] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

export const matches = pgTable(
  "matches",
  {
    id: serial("id").primaryKey(),
    externalId: text("external_id").notNull(),

    // Present from day one so widening beyond the league needs no migration.
    // Every row ingested today is 'eng.1'.
    competition: text("competition").notNull().default("eng.1"),

    // Season start year: 2025 == the 2025/26 season.
    season: integer("season").notNull(),

    // ESPN does NOT provide matchweek on the scoreboard payload (always null),
    // so this is derived during ingest rather than read from the source.
    matchweek: integer("matchweek"),

    kicksOffAt: timestamp("kicks_off_at", { withTimezone: true }).notNull(),
    status: text("status").notNull(),

    homeTeamId: integer("home_team_id")
      .notNull()
      .references(() => teams.id),
    awayTeamId: integer("away_team_id")
      .notNull()
      .references(() => teams.id),

    homeGoals: integer("home_goals"),
    awayGoals: integer("away_goals"),

    // A football clock counts up across two halves and adds stoppage on top:
    // "90'+7'" is minute 90, stoppage 7 -- not minute 97. Splitting them keeps
    // ordering correct and lets the UI render the real "90+7" label.
    minute: integer("minute"),
    stoppageMinute: integer("stoppage_minute"),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("matches_external_id_idx").on(t.externalId),
    index("matches_kicks_off_at_idx").on(t.kicksOffAt),
    index("matches_status_idx").on(t.status),
    index("matches_competition_season_idx").on(t.competition, t.season),
    index("matches_home_team_idx").on(t.homeTeamId),
    index("matches_away_team_idx").on(t.awayTeamId),
  ],
);

export type Team = typeof teams.$inferSelect;
export type Match = typeof matches.$inferSelect;
