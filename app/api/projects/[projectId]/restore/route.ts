import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "../../../../../db";
import { projects } from "../../../../../db/schema";
import { recordAudit } from "../../../../lib/auth/audit";
import { requireUser } from "../../../../lib/auth/session";
import { projectAccessResponse, requireProjectAccess } from "../../../../lib/projects/access";
import { readProjectDetail } from "../../../../lib/projects/queries";

type Context = { params: Promise<{ projectId: string }> };
export async function POST(request: Request, context: Context) {
  const actor = await requireUser(); const { projectId } = await context.params;
  try { await requireProjectAccess(actor, projectId, "manage"); } catch (error) { return projectAccessResponse(error) ?? Promise.reject(error); }
  const payload = await request.json() as { version?: unknown };
  if (!Number.isInteger(payload.version)) return NextResponse.json({ error: "缺少有效项目版本。" }, { status: 400 });
  const now = new Date();
  const [updated] = await db.update(projects).set({ archivedAt: null, archivedBy: null, updatedAt: now, version: Number(payload.version) + 1 })
    .where(and(eq(projects.id, projectId), eq(projects.version, Number(payload.version)))).returning({ id: projects.id });
  if (!updated) return NextResponse.json({ error: "项目已被其他成员更新，请重新加载。", code: "VERSION_CONFLICT" }, { status: 409 });
  await recordAudit({ action: "project.restored", targetType: "project", targetId: projectId, projectId, actorUserId: actor.id, teamId: actor.teamId });
  return NextResponse.json({ project: await readProjectDetail(actor, projectId) });
}
