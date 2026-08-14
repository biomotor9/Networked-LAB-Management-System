import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "../../../../../db";
import { entries, plans } from "../../../../../db/schema";
import { validateEntry } from "../../../../features/workspace/content";
import { requireUser } from "../../../../lib/auth/session";
import { getOrCreateTeamProject } from "../../../../lib/workspace/project-access";

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Context) {
  const actor = await requireUser();
  const project = await getOrCreateTeamProject(actor);
  const { id } = await context.params;
  const payload = await request.json() as Record<string, unknown>;
  if (!Number.isInteger(payload.version) || Number(payload.version) < 1) return NextResponse.json({ error: "实验事件版本无效。" }, { status: 400 });
  let entry;
  try { entry = validateEntry({ ...payload, id }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "实验事件无效。" }, { status: 400 }); }
  const planKey = `${project.id}:${entry.planId}`;
  const [plan] = await db.select({ key: plans.key }).from(plans).where(eq(plans.key, planKey)).limit(1);
  if (!plan) return NextResponse.json({ error: "计划不存在。" }, { status: 404 });
  const [updated] = await db.update(entries).set({
    planKey, planId: entry.planId, date: entry.date, type: entry.type, title: entry.title, content: entry.content,
    version: Number(payload.version) + 1, updatedBy: actor.id, updatedAt: new Date(),
  }).where(and(eq(entries.key, `${project.id}:${id}`), eq(entries.version, Number(payload.version)))).returning();
  if (!updated) return NextResponse.json({ error: "实验事件已被其他成员修改，请刷新后重试。", code: "VERSION_CONFLICT" }, { status: 409 });
  return NextResponse.json({ entry: { id: updated.id, planId: updated.planId, date: updated.date, type: updated.type, title: updated.title, content: updated.content, version: updated.version } });
}

export async function DELETE(request: Request, context: Context) {
  const actor = await requireUser();
  const project = await getOrCreateTeamProject(actor);
  const { id } = await context.params;
  const payload = await request.json().catch(() => ({})) as { version?: unknown };
  if (!Number.isInteger(payload.version) || Number(payload.version) < 1) return NextResponse.json({ error: "实验事件版本无效。" }, { status: 400 });
  const [deleted] = await db.delete(entries).where(and(eq(entries.key, `${project.id}:${id}`), eq(entries.version, Number(payload.version)))).returning({ id: entries.id });
  if (!deleted) return NextResponse.json({ error: "实验事件已变化，请刷新后重试。", code: "VERSION_CONFLICT" }, { status: 409 });
  return NextResponse.json({ deleted: true });
}
