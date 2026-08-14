import { NextResponse } from "next/server";
import { requireUser } from "../../lib/auth/session";
import { getOrCreateTeamProject } from "../../lib/workspace/project-access";
import { readProjectSnapshot } from "../../lib/workspace/snapshot";
import { readProjectContent } from "../../lib/workspace/content";

export const dynamic = "force-dynamic";

export async function GET() {
  const actor = await requireUser();
  const project = await getOrCreateTeamProject(actor);
  const [snapshot, content] = await Promise.all([readProjectSnapshot(project.id), readProjectContent(project.id)]);
  return NextResponse.json({ project: { id: project.id, name: project.name, version: project.version }, ...snapshot, ...content });
}
