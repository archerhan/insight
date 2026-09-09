CREATE TABLE "decision_followups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"wave" integer NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"responded_at" timestamp with time zone,
	"regret_level" text,
	"most_valuable_claim_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"dedupe_key" text,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"payload" jsonb,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "predictions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"bettor_id" uuid NOT NULL,
	"target_type" text DEFAULT 'decision' NOT NULL,
	"target_claim_id" uuid,
	"statement" text NOT NULL,
	"predicted_outcome" text NOT NULL,
	"amount" bigint DEFAULT 0 NOT NULL,
	"multiplier" numeric(6, 2) DEFAULT '1' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"reality_check_id" uuid,
	"payout" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reality_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"target_claim_id" uuid,
	"kind" text DEFAULT 'decision' NOT NULL,
	"result" text NOT NULL,
	"decided_by" text DEFAULT 'user' NOT NULL,
	"evidence_note" text,
	"source_url" text,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_stats" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"judgment_score" numeric(5, 2),
	"prediction_hit" integer DEFAULT 0 NOT NULL,
	"prediction_total" integer DEFAULT 0 NOT NULL,
	"contribution_count" integer DEFAULT 0 NOT NULL,
	"persuasion_count" integer DEFAULT 0 NOT NULL,
	"honesty_count" integer DEFAULT 0 NOT NULL,
	"abandon_count" integer DEFAULT 0 NOT NULL,
	"adjudicator_weight" numeric(4, 2) DEFAULT '1' NOT NULL,
	"calibration_rate" numeric(5, 2),
	"drift_level" text DEFAULT 'low' NOT NULL,
	"open_penalties" integer DEFAULT 0 NOT NULL,
	"decision_score" numeric(5, 2),
	"risk_closures_total" integer DEFAULT 0 NOT NULL,
	"risk_closures_validated" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "decision_followups" ADD CONSTRAINT "decision_followups_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_followups" ADD CONSTRAINT "decision_followups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_followups" ADD CONSTRAINT "decision_followups_most_valuable_claim_id_claims_id_fk" FOREIGN KEY ("most_valuable_claim_id") REFERENCES "public"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_bettor_id_users_id_fk" FOREIGN KEY ("bettor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_target_claim_id_claims_id_fk" FOREIGN KEY ("target_claim_id") REFERENCES "public"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_reality_check_id_reality_checks_id_fk" FOREIGN KEY ("reality_check_id") REFERENCES "public"."reality_checks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reality_checks" ADD CONSTRAINT "reality_checks_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reality_checks" ADD CONSTRAINT "reality_checks_target_claim_id_claims_id_fk" FOREIGN KEY ("target_claim_id") REFERENCES "public"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_stats" ADD CONSTRAINT "user_stats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "decision_followups_topic_wave_idx" ON "decision_followups" USING btree ("topic_id","wave");--> statement-breakpoint
CREATE INDEX "decision_followups_due_idx" ON "decision_followups" USING btree ("due_at","status");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_user_type_key_idx" ON "notifications" USING btree ("user_id","type","dedupe_key");--> statement-breakpoint
CREATE INDEX "notifications_user_read_idx" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE UNIQUE INDEX "predictions_topic_bettor_idx" ON "predictions" USING btree ("topic_id","bettor_id");--> statement-breakpoint
CREATE INDEX "predictions_bettor_idx" ON "predictions" USING btree ("bettor_id");--> statement-breakpoint
CREATE INDEX "predictions_topic_status_idx" ON "predictions" USING btree ("topic_id","status");--> statement-breakpoint
CREATE INDEX "reality_checks_topic_idx" ON "reality_checks" USING btree ("topic_id");