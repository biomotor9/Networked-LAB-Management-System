import { sql } from "drizzle-orm";
import { boolean, check, doublePrecision, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  mustChangePassword: boolean("must_change_password").notNull().default(true),
  disabled: boolean("disabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("users_email_unique").on(table.email)]);

export const teams = pgTable("teams", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdBy: text("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const teamMembers = pgTable("team_members", {
  teamId: text("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["owner", "member"] }).notNull(),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.teamId, table.userId] }),
  index("team_members_user_idx").on(table.userId),
]);

export const projects = pgTable("projects", {
  id: text("id").primaryKey(),
  teamId: text("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  normalizedName: text("normalized_name").notNull(),
  description: text("description").notNull().default(""),
  status: text("status", { enum: ["筹备中", "进行中", "暂停", "已完成"] }).notNull().default("筹备中"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  archivedBy: text("archived_by").references(() => users.id, { onDelete: "set null" }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  completedBy: text("completed_by").references(() => users.id, { onDelete: "set null" }),
  version: integer("version").notNull().default(1),
  createdBy: text("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("projects_team_name_unique").on(table.teamId, table.normalizedName),
  index("projects_team_archived_idx").on(table.teamId, table.archivedAt),
]);

export const projectMembers = pgTable("project_members", {
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["lead", "member", "viewer"] }).notNull(),
  addedBy: text("added_by").references(() => users.id, { onDelete: "set null" }),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.projectId, table.userId] }),
  uniqueIndex("project_members_single_lead_unique").on(table.projectId).where(sql`${table.role} = 'lead'`),
  index("project_members_user_idx").on(table.userId),
]);

export const plans = pgTable("plans", {
  key: text("key").primaryKey(),
  id: text("id").notNull(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  parentId: text("parent_id"),
  title: text("title").notNull(),
  domain: text("domain").notNull(),
  status: text("status").notNull(),
  summary: text("summary").notNull().default(""),
  objective: text("objective").notNull().default(""),
  success: text("success").notNull().default(""),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  plannedCompletionDate: text("planned_completion_date"),
  completedAt: text("completed_at"),
  graphX: doublePrecision("graph_x"),
  graphY: doublePrecision("graph_y"),
  version: integer("version").notNull().default(1),
  createdBy: text("created_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("plans_project_id_unique").on(table.projectId, table.id),
  index("plans_project_parent_idx").on(table.projectId, table.parentId),
]);

export const dependencies = pgTable("dependencies", {
  key: text("key").primaryKey(),
  id: text("id").notNull(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  sourcePlanId: text("source_plan_id").notNull(),
  targetPlanId: text("target_plan_id").notNull(),
  label: text("label"),
  arrowStyle: text("arrow_style"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("dependencies_project_pair_unique").on(table.projectId, table.sourcePlanId, table.targetPlanId),
  uniqueIndex("dependencies_project_id_unique").on(table.projectId, table.id),
  index("dependencies_project_idx").on(table.projectId),
]);

export const documents = pgTable("documents", {
  key: text("key").primaryKey().references(() => plans.key, { onDelete: "cascade" }),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  planId: text("plan_id").notNull(),
  content: text("content").notNull().default(""),
  version: integer("version").notNull().default(1),
  updatedBy: text("updated_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("documents_project_plan_unique").on(table.projectId, table.planId),
  index("documents_project_idx").on(table.projectId),
]);

export const entries = pgTable("entries", {
  key: text("key").primaryKey(),
  id: text("id").notNull(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  planKey: text("plan_key").notNull().references(() => plans.key, { onDelete: "cascade" }),
  planId: text("plan_id").notNull(),
  date: text("date").notNull(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  version: integer("version").notNull().default(1),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  updatedBy: text("updated_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("entries_project_id_unique").on(table.projectId, table.id),
  index("entries_project_plan_idx").on(table.projectId, table.planId),
]);

export const questions = pgTable("questions", {
  key: text("key").primaryKey(),
  id: text("id").notNull(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  sourcePlanKey: text("source_plan_key").notNull().references(() => plans.key, { onDelete: "cascade" }),
  sourcePlanId: text("source_plan_id").notNull(),
  number: integer("number").notNull(),
  title: text("title").notNull(),
  context: text("context").notNull().default(""),
  sourceExcerpt: text("source_excerpt").notNull().default(""),
  status: text("status", { enum: ["待解答", "待验证", "已解决", "已搁置"] }).notNull().default("待解答"),
  resolution: text("resolution").notNull().default(""),
  answerOutcome: text("answer_outcome", { enum: ["待回填", "支持", "否定", "不确定"] }).notNull().default("待回填"),
  answerNote: text("answer_note").notNull().default(""),
  version: integer("version").notNull().default(1),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  resolvedBy: text("resolved_by").references(() => users.id, { onDelete: "set null" }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("questions_project_id_unique").on(table.projectId, table.id),
  uniqueIndex("questions_project_number_unique").on(table.projectId, table.number),
  index("questions_project_plan_idx").on(table.projectId, table.sourcePlanId),
  index("questions_project_status_idx").on(table.projectId, table.status),
  check("questions_number_positive", sql`${table.number} > 0`),
]);

export const questionComments = pgTable("question_comments", {
  key: text("key").primaryKey(),
  id: text("id").notNull(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  questionKey: text("question_key").notNull().references(() => questions.key, { onDelete: "cascade" }),
  questionId: text("question_id").notNull(),
  content: text("content").notNull(),
  version: integer("version").notNull().default(1),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  updatedBy: text("updated_by").references(() => users.id, { onDelete: "set null" }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("question_comments_project_id_unique").on(table.projectId, table.id),
  index("question_comments_question_idx").on(table.projectId, table.questionId, table.createdAt),
]);

export const questionExperimentLinks = pgTable("question_experiment_links", {
  key: text("key").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  questionKey: text("question_key").notNull().references(() => questions.key, { onDelete: "cascade" }),
  questionId: text("question_id").notNull(),
  planKey: text("plan_key").notNull().references(() => plans.key, { onDelete: "cascade" }),
  planId: text("plan_id").notNull(),
  outcome: text("outcome", { enum: ["待回填", "支持", "否定", "不确定"] }).notNull().default("待回填"),
  note: text("note").notNull().default(""),
  version: integer("version").notNull().default(1),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("question_experiment_links_pair_unique").on(table.projectId, table.questionId, table.planId),
  index("question_experiment_links_plan_idx").on(table.projectId, table.planId),
]);

export const attachments = pgTable("attachments", {
  key: text("key").primaryKey(),
  id: text("id").notNull(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  planKey: text("plan_key").references(() => plans.key, { onDelete: "cascade" }),
  planId: text("plan_id"),
  originalName: text("original_name").notNull(),
  storageKey: text("storage_key").notNull(),
  mimeType: text("mime_type").notNull().default("application/octet-stream"),
  sizeBytes: integer("size_bytes").notNull(),
  sha256: text("sha256").notNull(),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("attachments_project_id_unique").on(table.projectId, table.id),
  uniqueIndex("attachments_storage_key_unique").on(table.storageKey),
  index("attachments_project_plan_idx").on(table.projectId, table.planId),
  check("attachments_scope_check", sql`(${table.planKey} is null and ${table.planId} is null) or (${table.planKey} is not null and ${table.planId} is not null)`),
]);

export const emergencyEditSessions = pgTable("emergency_edit_sessions", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("emergency_edit_project_user_idx").on(table.projectId, table.userId, table.expiresAt),
]);

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("sessions_token_hash_unique").on(table.tokenHash),
  index("sessions_user_idx").on(table.userId),
  index("sessions_expires_idx").on(table.expiresAt),
]);

export const auditEvents = pgTable("audit_events", {
  id: text("id").primaryKey(),
  teamId: text("team_id").references(() => teams.id, { onDelete: "set null" }),
  projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
  actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id"),
  metadataJson: text("metadata_json").notNull().default("{}"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("audit_events_team_created_idx").on(table.teamId, table.createdAt),
  index("audit_events_project_created_idx").on(table.projectId, table.createdAt),
]);
