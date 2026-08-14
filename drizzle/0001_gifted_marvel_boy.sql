CREATE TABLE "dependencies" (
	"key" text PRIMARY KEY NOT NULL,
	"id" text NOT NULL,
	"project_id" text NOT NULL,
	"source_plan_id" text NOT NULL,
	"target_plan_id" text NOT NULL,
	"label" text,
	"arrow_style" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"key" text PRIMARY KEY NOT NULL,
	"id" text NOT NULL,
	"project_id" text NOT NULL,
	"parent_id" text,
	"title" text NOT NULL,
	"domain" text NOT NULL,
	"status" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"objective" text DEFAULT '' NOT NULL,
	"success" text DEFAULT '' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"planned_completion_date" text,
	"completed_at" text,
	"graph_x" double precision,
	"graph_y" double precision,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"name" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dependencies" ADD CONSTRAINT "dependencies_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dependencies_project_pair_unique" ON "dependencies" USING btree ("project_id","source_plan_id","target_plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dependencies_project_id_unique" ON "dependencies" USING btree ("project_id","id");--> statement-breakpoint
CREATE INDEX "dependencies_project_idx" ON "dependencies" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plans_project_id_unique" ON "plans" USING btree ("project_id","id");--> statement-breakpoint
CREATE INDEX "plans_project_parent_idx" ON "plans" USING btree ("project_id","parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_team_unique" ON "projects" USING btree ("team_id");