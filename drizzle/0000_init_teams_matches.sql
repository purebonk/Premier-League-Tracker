CREATE TABLE "matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"external_id" text NOT NULL,
	"competition" text DEFAULT 'eng.1' NOT NULL,
	"season" integer NOT NULL,
	"matchweek" integer,
	"kicks_off_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"home_team_id" integer NOT NULL,
	"away_team_id" integer NOT NULL,
	"home_goals" integer,
	"away_goals" integer,
	"minute" integer,
	"stoppage_minute" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" serial PRIMARY KEY NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"short_name" text NOT NULL,
	"crest_url" text
);
--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_home_team_id_teams_id_fk" FOREIGN KEY ("home_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_away_team_id_teams_id_fk" FOREIGN KEY ("away_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "matches_external_id_idx" ON "matches" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX "matches_kicks_off_at_idx" ON "matches" USING btree ("kicks_off_at");--> statement-breakpoint
CREATE INDEX "matches_status_idx" ON "matches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "matches_competition_season_idx" ON "matches" USING btree ("competition","season");--> statement-breakpoint
CREATE INDEX "matches_home_team_idx" ON "matches" USING btree ("home_team_id");--> statement-breakpoint
CREATE INDEX "matches_away_team_idx" ON "matches" USING btree ("away_team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_external_id_idx" ON "teams" USING btree ("external_id");