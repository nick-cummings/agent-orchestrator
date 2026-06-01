CREATE TABLE "activities" (
	"id" text PRIMARY KEY NOT NULL,
	"execution_id" text NOT NULL,
	"seq" integer NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"source" text NOT NULL,
	"kind" text NOT NULL,
	"text" text,
	"data" jsonb,
	"cursor" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "executions" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"engine" text NOT NULL,
	"external_ref" text NOT NULL,
	"state" text DEFAULT 'starting' NOT NULL,
	"prompt" text DEFAULT '' NOT NULL,
	"last_activity_cursor" text,
	"deep_link_url" text NOT NULL,
	"result_pr_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"card_id" text NOT NULL,
	"brain_provider" text DEFAULT 'claude' NOT NULL,
	"executor_engine" text DEFAULT 'jules' NOT NULL,
	"model" text DEFAULT '' NOT NULL,
	"verbosity" text DEFAULT 'verbose' NOT NULL,
	"system_prompt" text,
	"skill_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"connection_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"repos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"require_plan_approval" boolean DEFAULT true NOT NULL,
	"last_active_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_card_id_unique" UNIQUE("card_id")
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_execution_id_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "activities_execution_seq" ON "activities" USING btree ("execution_id","seq");