import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "../../../../db";
import { dependencies, documents, entries, plans, projectMembers, projects, teamMembers, users } from "../../../../db/schema";
import { validateProjectDate, validateProjectDescription, validateProjectName, validateProjectStatus, validateProjectTags } from "../../../features/projects/model";
import { validateWorkspaceContent } from "../../../features/workspace/content";
import { validatePlanDependencySnapshot } from "../../../features/workspace/server-snapshot";
import { recordAudit } from "../../../lib/auth/audit";
import { requireUser } from "../../../lib/auth/session";
import { projectAccessResponse, requireProjectAccess } from "../../../lib/projects/access";
import { readProjectDetail } from "../../../lib/projects/queries";
import { readProjectSnapshot } from "../../../lib/workspace/snapshot";

type BackupProject = {
  project?: Record<string, unknown>;
  members?: Array<{ email?: unknown; role?: unknown }>;
  plans?: unknown;
  dependencies?: unknown;
  documents?: unknown;
  entries?: unknown;
};

export async function POST(request: Request) {
  const actor = await requireUser();
  const payload = await request.json() as { mode?: unknown; targetProjectId?: unknown; version?: unknown; name?: unknown; data?: BackupProject };
  if (payload.mode !== "new" && payload.mode !== "merge") return NextResponse.json({ error: "导入模式无效。" }, { status: 400 });
  if (!payload.data?.project) return NextResponse.json({ error: "项目备份格式无效。" }, { status: 400 });
  let snapshot; let content;
  try {
    snapshot = validatePlanDependencySnapshot({ plans: payload.data.plans, dependencies: payload.data.dependencies });
    content = validateWorkspaceContent({ documents: payload.data.documents, entries: payload.data.entries }, new Set(snapshot.plans.map((plan) => plan.id)));
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "项目备份内容无效。" }, { status: 400 }); }

  if (payload.mode === "new") {
    let projectValues;
    try {
      const name = validateProjectName(payload.name ?? payload.data.project.name);
      projectValues = {
        id: randomUUID(), teamId: actor.teamId, ...name,
        description: validateProjectDescription(payload.data.project.description),
        status: validateProjectStatus(payload.data.project.status ?? "筹备中"),
        startDate: validateProjectDate(payload.data.project.startDate, "开始日期"),
        endDate: validateProjectDate(payload.data.project.endDate, "结束日期"),
        tags: validateProjectTags(payload.data.project.tags), createdBy: actor.id,
      };
    } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "项目元数据无效。" }, { status: 400 }); }
    try {
      const memberEmails = (payload.data.members ?? []).map((member) => typeof member.email === "string" ? member.email.trim().toLowerCase() : "").filter(Boolean);
      const matchedMembers = memberEmails.length ? await db.select({ userId: users.id, email: users.email }).from(teamMembers)
        .innerJoin(users, eq(users.id, teamMembers.userId)).where(and(eq(teamMembers.teamId, actor.teamId), eq(users.disabled, false), inArray(users.email, memberEmails))) : [];
      await db.transaction(async (tx) => {
        await tx.insert(projects).values(projectValues);
        await tx.insert(projectMembers).values({ projectId: projectValues.id, userId: actor.id, role: "lead", addedBy: actor.id });
        const importedMemberships = matchedMembers.filter((member) => member.userId !== actor.id).map((member) => {
          const backupMember = payload.data!.members!.find((candidate) =>
            typeof candidate.email === "string" && candidate.email.trim().toLowerCase() === member.email.toLowerCase(),
          );
          return { projectId: projectValues.id, userId: member.userId, role: backupMember?.role === "viewer" ? "viewer" as const : "member" as const, addedBy: actor.id };
        });
        if (importedMemberships.length) await tx.insert(projectMembers).values(importedMemberships);
        if (snapshot.plans.length) await tx.insert(plans).values(snapshot.plans.map((plan) => ({
          key: `${projectValues.id}:${plan.id}`, id: plan.id, projectId: projectValues.id, parentId: plan.parentId, title: plan.title,
          domain: plan.domain, status: plan.status, summary: plan.summary, objective: plan.objective, success: plan.success, tags: plan.tags,
          plannedCompletionDate: plan.plannedCompletionDate, completedAt: plan.completedAt, graphX: plan.graphX, graphY: plan.graphY, createdBy: actor.id,
        })));
        if (snapshot.dependencies.length) await tx.insert(dependencies).values(snapshot.dependencies.map((dependency) => ({ key: `${projectValues.id}:${dependency.id}`, id: dependency.id, projectId: projectValues.id, sourcePlanId: dependency.sourceId, targetPlanId: dependency.targetId, label: dependency.label, arrowStyle: dependency.arrowStyle })));
        const documentValues = Object.entries(content.documents).map(([planId, markdown]) => ({ key: `${projectValues.id}:${planId}`, projectId: projectValues.id, planId, content: markdown, version: 1, updatedBy: actor.id }));
        if (documentValues.length) await tx.insert(documents).values(documentValues);
        if (content.entries.length) await tx.insert(entries).values(content.entries.map((entry) => ({ key: `${projectValues.id}:${entry.id}`, id: entry.id, projectId: projectValues.id, planKey: `${projectValues.id}:${entry.planId}`, planId: entry.planId, date: entry.date, type: entry.type, title: entry.title, content: entry.content, version: 1, createdBy: actor.id, updatedBy: actor.id })));
      });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "23505") return NextResponse.json({ error: "团队内已存在同名项目或备份包含冲突 ID。" }, { status: 409 });
      throw error;
    }
    await recordAudit({ action: "project.imported", targetType: "project", targetId: projectValues.id, projectId: projectValues.id, actorUserId: actor.id, teamId: actor.teamId, metadata: { mode: "new", plans: snapshot.plans.length } });
    return NextResponse.json({ project: await readProjectDetail(actor, projectValues.id) }, { status: 201 });
  }

  if (typeof payload.targetProjectId !== "string" || !Number.isInteger(payload.version)) return NextResponse.json({ error: "缺少目标项目或有效版本。" }, { status: 400 });
  let access;
  try { access = await requireProjectAccess(actor, payload.targetProjectId, "edit-content"); } catch (error) { return projectAccessResponse(error) ?? Promise.reject(error); }
  const existing = await readProjectSnapshot(payload.targetProjectId);
  const existingIds = new Set(existing.plans.map((plan) => plan.id));
  const conflicts = snapshot.plans.filter((plan) => existingIds.has(plan.id));
  if (conflicts.length) return NextResponse.json({ error: "备份与当前项目存在计划 ID 冲突，不能自动合并。", conflicts: conflicts.map((plan) => plan.title) }, { status: 409 });
  try { validatePlanDependencySnapshot({ plans: [...existing.plans, ...snapshot.plans], dependencies: [...existing.dependencies, ...snapshot.dependencies] }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "合并后计划网络无效。" }, { status: 409 }); }
  const entryIds = content.entries.map((entry) => entry.id);
  if (entryIds.length) {
    const duplicates = await db.select({ id: entries.id }).from(entries).where(and(eq(entries.projectId, payload.targetProjectId), inArray(entries.id, entryIds)));
    if (duplicates.length) return NextResponse.json({ error: "备份与当前项目存在事件 ID 冲突，不能自动合并。" }, { status: 409 });
  }
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${payload.targetProjectId as string}))`);
      const [updated] = await tx.update(projects).set({ version: Number(payload.version) + 1, updatedAt: new Date() }).where(and(eq(projects.id, payload.targetProjectId as string), eq(projects.version, Number(payload.version)))).returning({ id: projects.id });
      if (!updated) throw new Error("VERSION_CONFLICT");
      if (snapshot.plans.length) await tx.insert(plans).values(snapshot.plans.map((plan) => ({ key: `${payload.targetProjectId}:${plan.id}`, id: plan.id, projectId: payload.targetProjectId as string, parentId: plan.parentId, title: plan.title, domain: plan.domain, status: plan.status, summary: plan.summary, objective: plan.objective, success: plan.success, tags: plan.tags, plannedCompletionDate: plan.plannedCompletionDate, completedAt: plan.completedAt, graphX: plan.graphX, graphY: plan.graphY, createdBy: actor.id })));
      if (snapshot.dependencies.length) await tx.insert(dependencies).values(snapshot.dependencies.map((dependency) => ({ key: `${payload.targetProjectId}:${dependency.id}`, id: dependency.id, projectId: payload.targetProjectId as string, sourcePlanId: dependency.sourceId, targetPlanId: dependency.targetId, label: dependency.label, arrowStyle: dependency.arrowStyle })));
      const documentValues = Object.entries(content.documents).map(([planId, markdown]) => ({ key: `${payload.targetProjectId}:${planId}`, projectId: payload.targetProjectId as string, planId, content: markdown, version: 1, updatedBy: actor.id }));
      if (documentValues.length) await tx.insert(documents).values(documentValues);
      if (content.entries.length) await tx.insert(entries).values(content.entries.map((entry) => ({ key: `${payload.targetProjectId}:${entry.id}`, id: entry.id, projectId: payload.targetProjectId as string, planKey: `${payload.targetProjectId}:${entry.planId}`, planId: entry.planId, date: entry.date, type: entry.type, title: entry.title, content: entry.content, version: 1, createdBy: actor.id, updatedBy: actor.id })));
    });
  } catch (error) {
    if (error instanceof Error && error.message === "VERSION_CONFLICT") return NextResponse.json({ error: "项目已被其他成员更新，请重新加载。", code: "VERSION_CONFLICT" }, { status: 409 });
    throw error;
  }
  await recordAudit({ action: "project.imported", targetType: "project", targetId: payload.targetProjectId, projectId: payload.targetProjectId, actorUserId: actor.id, teamId: actor.teamId, metadata: { mode: "merge", plans: snapshot.plans.length, emergencyReason: access.emergencyReason } });
  return NextResponse.json({ merged: true, version: Number(payload.version) + 1 });
}
