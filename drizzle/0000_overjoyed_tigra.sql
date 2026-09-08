CREATE TABLE "ai_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid,
	"kind" text NOT NULL,
	"detail" jsonb,
	"confidence" numeric(4, 3),
	"status" text DEFAULT 'flagged' NOT NULL,
	"ai_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"target_claim_id" uuid NOT NULL,
	"challenger_claim_id" uuid NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolution_reason" text,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"orange_at" timestamp with time zone,
	"red_at" timestamp with time zone,
	"default_loss_at" timestamp with time zone,
	"responded_claim_id" uuid,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "claim_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "claim_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"topic_id" uuid NOT NULL,
	"claim_id" uuid,
	"type" text NOT NULL,
	"actor_user_id" uuid,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claim_tags" (
	"claim_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"parent_id" uuid,
	"relation" text NOT NULL,
	"content_title" text NOT NULL,
	"content_body" text,
	"author_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"depth" integer DEFAULT 0 NOT NULL,
	"ancestors" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"supersedes_claim_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conclusion_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"claim_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"role" text DEFAULT 'adopted_reason' NOT NULL,
	"support_chain" jsonb,
	"note" text,
	"adopted_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conclusion_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"verdict_text" text NOT NULL,
	"recommendation_text" text,
	"premises" text,
	"settlement" text DEFAULT 'provisional' NOT NULL,
	"created_by_user_id" uuid,
	"summary_snapshot" jsonb,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid NOT NULL,
	"kind" text DEFAULT 'source' NOT NULL,
	"summary" text NOT NULL,
	"source_title" text,
	"url" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"verifier_user_id" uuid,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reputation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"outcome" text DEFAULT 'neutral' NOT NULL,
	"claim_id" uuid,
	"topic_id" uuid,
	"weight" numeric(5, 2) DEFAULT '1' NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stance_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"from_stance" text NOT NULL,
	"to_stance" text NOT NULL,
	"source_claim_id" uuid,
	"persuader_user_id" uuid,
	"statement" text NOT NULL,
	"novelty_pass" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tags_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "topic_tags" (
	"topic_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"visibility" text DEFAULT 'public' NOT NULL,
	"allow_public_rebuttal" boolean DEFAULT true NOT NULL,
	"close_mode" text DEFAULT 'owner' NOT NULL,
	"stake_enabled" boolean DEFAULT false NOT NULL,
	"reveal_at" timestamp with time zone,
	"bounty_enabled" boolean DEFAULT false NOT NULL,
	"node_count" integer DEFAULT 0 NOT NULL,
	"adopted_count" integer DEFAULT 0 NOT NULL,
	"open_challenge_count" integer DEFAULT 0 NOT NULL,
	"prediction_count" integer DEFAULT 0 NOT NULL,
	"current_version_id" uuid,
	"closed_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_id" text,
	"display_name" text NOT NULL,
	"avatar_url" text,
	"bio" text,
	"course_completed_at" timestamp with time zone,
	"coin_balance" bigint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_auth_id_unique" UNIQUE("auth_id")
);
--> statement-breakpoint
ALTER TABLE "ai_flags" ADD CONSTRAINT "ai_flags_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_target_claim_id_claims_id_fk" FOREIGN KEY ("target_claim_id") REFERENCES "public"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_challenger_claim_id_claims_id_fk" FOREIGN KEY ("challenger_claim_id") REFERENCES "public"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_responded_claim_id_claims_id_fk" FOREIGN KEY ("responded_claim_id") REFERENCES "public"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_events" ADD CONSTRAINT "claim_events_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_events" ADD CONSTRAINT "claim_events_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_events" ADD CONSTRAINT "claim_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_tags" ADD CONSTRAINT "claim_tags_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_tags" ADD CONSTRAINT "claim_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conclusion_items" ADD CONSTRAINT "conclusion_items_version_id_conclusion_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."conclusion_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conclusion_items" ADD CONSTRAINT "conclusion_items_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conclusion_items" ADD CONSTRAINT "conclusion_items_adopted_by_user_id_users_id_fk" FOREIGN KEY ("adopted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conclusion_versions" ADD CONSTRAINT "conclusion_versions_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conclusion_versions" ADD CONSTRAINT "conclusion_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_verifier_user_id_users_id_fk" FOREIGN KEY ("verifier_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reputation_events" ADD CONSTRAINT "reputation_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reputation_events" ADD CONSTRAINT "reputation_events_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reputation_events" ADD CONSTRAINT "reputation_events_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stance_changes" ADD CONSTRAINT "stance_changes_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stance_changes" ADD CONSTRAINT "stance_changes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stance_changes" ADD CONSTRAINT "stance_changes_source_claim_id_claims_id_fk" FOREIGN KEY ("source_claim_id") REFERENCES "public"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stance_changes" ADD CONSTRAINT "stance_changes_persuader_user_id_users_id_fk" FOREIGN KEY ("persuader_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_tags" ADD CONSTRAINT "topic_tags_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_tags" ADD CONSTRAINT "topic_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "challenges_target_challenger_idx" ON "challenges" USING btree ("target_claim_id","challenger_claim_id");--> statement-breakpoint
CREATE INDEX "challenges_status_deadline_idx" ON "challenges" USING btree ("status","default_loss_at");--> statement-breakpoint
CREATE INDEX "claim_events_topic_time_idx" ON "claim_events" USING btree ("topic_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "claim_tags_claim_tag_idx" ON "claim_tags" USING btree ("claim_id","tag_id");--> statement-breakpoint
CREATE INDEX "claims_topic_parent_idx" ON "claims" USING btree ("topic_id","parent_id");--> statement-breakpoint
CREATE INDEX "claims_topic_ancestors_idx" ON "claims" USING gin ("ancestors");--> statement-breakpoint
CREATE INDEX "claims_status_idx" ON "claims" USING btree ("status");--> statement-breakpoint
CREATE INDEX "conclusion_items_version_idx" ON "conclusion_items" USING btree ("version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conclusion_versions_topic_no_idx" ON "conclusion_versions" USING btree ("topic_id","version_no");--> statement-breakpoint
CREATE UNIQUE INDEX "stance_changes_topic_user_idx" ON "stance_changes" USING btree ("topic_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "topic_tags_topic_tag_idx" ON "topic_tags" USING btree ("topic_id","tag_id");--> statement-breakpoint
CREATE INDEX "topics_last_activity_idx" ON "topics" USING btree ("last_activity_at");