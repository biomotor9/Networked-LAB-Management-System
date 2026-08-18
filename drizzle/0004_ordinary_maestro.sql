CREATE TABLE "emergency_edit_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"reason" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_members" (
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"added_by" text,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_members_project_id_user_id_pk" PRIMARY KEY("project_id","user_id")
);
--> statement-breakpoint
DROP INDEX "projects_team_unique";--> statement-breakpoint
ALTER TABLE "attachments" ALTER COLUMN "plan_key" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "attachments" ALTER COLUMN "plan_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "project_id" text;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "normalized_name" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "status" text DEFAULT '筹备中' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "start_date" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "end_date" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "tags" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "archived_by" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "completed_by" text;--> statement-breakpoint
ALTER TABLE "emergency_edit_sessions" ADD CONSTRAINT "emergency_edit_sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emergency_edit_sessions" ADD CONSTRAINT "emergency_edit_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
UPDATE "projects"
SET "name" = '历史实验项目',
	"normalized_name" = '历史实验项目',
	"description" = '由系统升级自动创建，保留升级前的全部实验计划与记录。',
	"status" = '进行中',
	"updated_at" = now();--> statement-breakpoint
INSERT INTO "project_members" ("project_id", "user_id", "role", "added_by")
SELECT "projects"."id", "team_admin"."user_id", 'lead', "team_admin"."user_id"
FROM "projects"
JOIN LATERAL (
	SELECT "team_members"."user_id"
	FROM "team_members"
	INNER JOIN "users" ON "users"."id" = "team_members"."user_id"
	WHERE "team_members"."team_id" = "projects"."team_id"
		AND "team_members"."role" = 'owner'
		AND "users"."disabled" = false
	ORDER BY "team_members"."joined_at", "users"."created_at"
	LIMIT 1
) AS "team_admin" ON true;--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM "projects"
		LEFT JOIN "project_members" ON "project_members"."project_id" = "projects"."id" AND "project_members"."role" = 'lead'
		WHERE "project_members"."project_id" IS NULL
	) THEN
		RAISE EXCEPTION 'Cannot migrate projects without an active team administrator';
	END IF;
END $$;--> statement-breakpoint
UPDATE "plans"
SET "created_by" = "project_members"."user_id"
FROM "project_members"
WHERE "project_members"."project_id" = "plans"."project_id"
	AND "project_members"."role" = 'lead';--> statement-breakpoint
ALTER TABLE "plans" ALTER COLUMN "created_by" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "normalized_name" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "emergency_edit_project_user_idx" ON "emergency_edit_sessions" USING btree ("project_id","user_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "project_members_single_lead_unique" ON "project_members" USING btree ("project_id") WHERE "project_members"."role" = 'lead';--> statement-breakpoint
CREATE INDEX "project_members_user_idx" ON "project_members" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_archived_by_users_id_fk" FOREIGN KEY ("archived_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
INSERT INTO "audit_events" ("id", "team_id", "project_id", "actor_user_id", "action", "target_type", "target_id", "metadata_json")
SELECT 'migration-multi-project:' || "projects"."id", "projects"."team_id", "projects"."id", "project_members"."user_id",
	'project.migrated', 'project', "projects"."id", '{"source":"single-project-upgrade"}'
FROM "projects"
INNER JOIN "project_members" ON "project_members"."project_id" = "projects"."id" AND "project_members"."role" = 'lead';--> statement-breakpoint
CREATE INDEX "audit_events_project_created_idx" ON "audit_events" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_team_name_unique" ON "projects" USING btree ("team_id","normalized_name");--> statement-breakpoint
CREATE INDEX "projects_team_archived_idx" ON "projects" USING btree ("team_id","archived_at");--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_scope_check" CHECK (("attachments"."plan_key" is null and "attachments"."plan_id" is null) or ("attachments"."plan_key" is not null and "attachments"."plan_id" is not null));
