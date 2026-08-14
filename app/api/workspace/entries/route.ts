import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "../../../../db";
import { entries, plans } from "../../../../db/schema";
import { validateEntry } from "../../../features/workspace/content";
import { makeId } from "../../../features/workspace/model";
import { requireUser } from "../../../lib/auth/session";
import { getOrCreateTeamProject } from "../../../lib/workspace/project-access";

export async function POST(request: Request) {
  const actor = await requireUser();
  const project = await getOrCreateTeamProject(actor);
  const payload = await request.json() as Record<string, unknown>;
  const id = typeof payload.id === "string" && payload.id ? payload.id : makeId("entry");
  let entry;
  try { entry = validateEntry({ ...payload, id }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "实验事件无效。" }, { status: 400 }); }
  const planKey = `${project.id}:${entry.planId}`;
  const [plan] = await db.select({ key: plans.key }).from(plans).where(eq(plans.key, planKey)).limit(1);
  if (!plan) return NextResponse.json({ error: "计划不存在。" }, { status: 404 });
  try {
    const [created] = await db.insert(entries).values({
      key: `${project.id}:${entry.id}`, id: entry.id, projectId: project.id, planKey, planId: entry.planId,
      date: entry.date, type: entry.type, title: entry.title, content: entry.content, version: 1,
      createdBy: actor.id, updatedBy: actor.id,
    }).returning();
    return NextResponse.json({ entry: { id: created.id, planId: created.planId, date: created.date, type: created.type, title: created.title, content: created.content, version: created.version } }, { status: 201 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "23505") return NextResponse.json({ error: "实验事件 ID 已存在。" }, { status: 409 });
    throw error;
  }
}
