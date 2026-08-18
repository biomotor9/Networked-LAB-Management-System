import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "../../../../db";
import { attachments, plans, projects } from "../../../../db/schema";
import {
  validateProjectDate,
  validateProjectDescription,
  validateProjectName,
  validateProjectStatus,
  validateProjectTags,
} from "../../../features/projects/model";
import { attachmentStorage } from "../../../lib/attachments/storage";
import { recordAudit } from "../../../lib/auth/audit";
import { requireUser } from "../../../lib/auth/session";
import { projectAccessResponse, requireProjectAccess } from "../../../lib/projects/access";
import { readProjectDetail } from "../../../lib/projects/queries";

type Context = { params: Promise<{ projectId: string }> };

export async function GET(_request: Request, context: Context) {
  const actor = await requireUser();
  const { projectId } = await context.params;
  try { return NextResponse.json({ project: await readProjectDetail(actor, projectId) }); }
  catch (error) { return projectAccessResponse(error) ?? Promise.reject(error); }
}

export async function PATCH(request: Request, context: Context) {
  const actor = await requireUser();
  const { projectId } = await context.params;
  let access;
  try { access = await requireProjectAccess(actor, projectId, "manage"); }
  catch (error) { return projectAccessResponse(error) ?? Promise.reject(error); }
  if (access.project.archivedAt) return NextResponse.json({ error: "归档项目为只读，请先恢复项目。" }, { status: 409 });
  const payload = await request.json() as Record<string, unknown>;
  if (!Number.isInteger(payload.version) || Number(payload.version) < 1) return NextResponse.json({ error: "缺少有效项目版本。" }, { status: 400 });
  const changes: Partial<typeof projects.$inferInsert> = { updatedAt: new Date() };
  try {
    if ("name" in payload) Object.assign(changes, validateProjectName(payload.name));
    if ("description" in payload) changes.description = validateProjectDescription(payload.description);
    if ("status" in payload) {
      const status = validateProjectStatus(payload.status);
      if (status === "已完成") return NextResponse.json({ error: "请使用完成项目操作进行二次确认。" }, { status: 400 });
      changes.status = status;
      changes.completedAt = null;
      changes.completedBy = null;
    }
    if ("startDate" in payload) changes.startDate = validateProjectDate(payload.startDate, "开始日期");
    if ("endDate" in payload) changes.endDate = validateProjectDate(payload.endDate, "结束日期");
    if ("tags" in payload) changes.tags = validateProjectTags(payload.tags);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "项目数据无效。" }, { status: 400 });
  }
  try {
    const [updated] = await db.update(projects).set({ ...changes, version: Number(payload.version) + 1 })
      .where(and(eq(projects.id, projectId), eq(projects.version, Number(payload.version)))).returning({ id: projects.id });
    if (!updated) return NextResponse.json({ error: "项目已被其他成员更新，请重新加载。", code: "VERSION_CONFLICT" }, { status: 409 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "23505") return NextResponse.json({ error: "团队内已存在同名项目。" }, { status: 409 });
    throw error;
  }
  await recordAudit({ action: "project.updated", targetType: "project", targetId: projectId, projectId, actorUserId: actor.id, teamId: actor.teamId, metadata: { fields: Object.keys(payload).filter((key) => key !== "version") } });
  return NextResponse.json({ project: await readProjectDetail(actor, projectId) });
}

export async function DELETE(request: Request, context: Context) {
  const actor = await requireUser();
  const { projectId } = await context.params;
  let access;
  try { access = await requireProjectAccess(actor, projectId, "manage"); }
  catch (error) { return projectAccessResponse(error) ?? Promise.reject(error); }
  const payload = await request.json().catch(() => ({})) as { name?: unknown };
  if (payload.name !== access.project.name) return NextResponse.json({ error: "请输入完整项目名称以确认永久删除。" }, { status: 400 });
  const [projectPlans, projectAttachments] = await Promise.all([
    db.select({ id: plans.id }).from(plans).where(eq(plans.projectId, projectId)),
    db.select({ id: attachments.id, storageKey: attachments.storageKey }).from(attachments).where(eq(attachments.projectId, projectId)),
  ]);
  if (projectPlans.length && !access.isTeamAdmin) return NextResponse.json({ error: "非空项目只能由团队管理员永久删除，项目负责人可以归档。" }, { status: 403 });
  await recordAudit({
    action: "project.deleted", targetType: "project", targetId: projectId, projectId,
    actorUserId: actor.id, teamId: actor.teamId,
    metadata: { name: access.project.name, plans: projectPlans.length, attachments: projectAttachments.length },
  });
  await db.delete(projects).where(and(eq(projects.id, projectId), eq(projects.teamId, actor.teamId)));
  const failed: string[] = [];
  for (const attachment of projectAttachments) {
    await attachmentStorage.remove(attachment.storageKey).catch(() => failed.push(attachment.id));
  }
  return NextResponse.json({ deleted: true, attachmentCleanupFailed: failed });
}
