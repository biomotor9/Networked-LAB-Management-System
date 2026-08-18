import { NextResponse } from "next/server";
import { requireUser } from "../../lib/auth/session";
import { projectAccessResponse } from "../../lib/projects/access";
import { requireWorkspaceProject } from "../../lib/workspace/project-access";
import { readProjectSnapshot } from "../../lib/workspace/snapshot";
import { readProjectContent } from "../../lib/workspace/content";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actor = await requireUser();
  let project;
  try { project = (await requireWorkspaceProject(actor, request, "view")).project; }
  catch (error) {
    if (error instanceof Error && error.message === "PROJECT_ID_REQUIRED") return NextResponse.json({ error: "请选择项目。" }, { status: 400 });
    return projectAccessResponse(error) ?? Promise.reject(error);
  }
  const [snapshot, content] = await Promise.all([readProjectSnapshot(project.id), readProjectContent(project.id)]);
  return NextResponse.json({ project: { id: project.id, name: project.name, version: project.version }, ...snapshot, ...content });
}
