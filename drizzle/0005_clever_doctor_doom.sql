CREATE TABLE "question_comments" (
	"key" text PRIMARY KEY NOT NULL,
	"id" text NOT NULL,
	"project_id" text NOT NULL,
	"question_key" text NOT NULL,
	"question_id" text NOT NULL,
	"content" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_experiment_links" (
	"key" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"question_key" text NOT NULL,
	"question_id" text NOT NULL,
	"plan_key" text NOT NULL,
	"plan_id" text NOT NULL,
	"outcome" text DEFAULT '待回填' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"key" text PRIMARY KEY NOT NULL,
	"id" text NOT NULL,
	"project_id" text NOT NULL,
	"source_plan_key" text NOT NULL,
	"source_plan_id" text NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"context" text DEFAULT '' NOT NULL,
	"source_excerpt" text DEFAULT '' NOT NULL,
	"status" text DEFAULT '待解答' NOT NULL,
	"resolution" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text,
	"resolved_by" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "questions_number_positive" CHECK ("questions"."number" > 0)
);
--> statement-breakpoint
ALTER TABLE "question_comments" ADD CONSTRAINT "question_comments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_comments" ADD CONSTRAINT "question_comments_question_key_questions_key_fk" FOREIGN KEY ("question_key") REFERENCES "public"."questions"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_comments" ADD CONSTRAINT "question_comments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_comments" ADD CONSTRAINT "question_comments_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_experiment_links" ADD CONSTRAINT "question_experiment_links_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_experiment_links" ADD CONSTRAINT "question_experiment_links_question_key_questions_key_fk" FOREIGN KEY ("question_key") REFERENCES "public"."questions"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_experiment_links" ADD CONSTRAINT "question_experiment_links_plan_key_plans_key_fk" FOREIGN KEY ("plan_key") REFERENCES "public"."plans"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_experiment_links" ADD CONSTRAINT "question_experiment_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_source_plan_key_plans_key_fk" FOREIGN KEY ("source_plan_key") REFERENCES "public"."plans"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "question_comments_project_id_unique" ON "question_comments" USING btree ("project_id","id");--> statement-breakpoint
CREATE INDEX "question_comments_question_idx" ON "question_comments" USING btree ("project_id","question_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "question_experiment_links_pair_unique" ON "question_experiment_links" USING btree ("project_id","question_id","plan_id");--> statement-breakpoint
CREATE INDEX "question_experiment_links_plan_idx" ON "question_experiment_links" USING btree ("project_id","plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "questions_project_id_unique" ON "questions" USING btree ("project_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "questions_project_number_unique" ON "questions" USING btree ("project_id","number");--> statement-breakpoint
CREATE INDEX "questions_project_plan_idx" ON "questions" USING btree ("project_id","source_plan_id");--> statement-breakpoint
CREATE INDEX "questions_project_status_idx" ON "questions" USING btree ("project_id","status");