import WorkspaceClient from "./workspace-client";
import { requireUser } from "./lib/auth/session";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await requireUser();
  return <WorkspaceClient viewer={{ id: user.id, displayName: user.displayName, role: user.role }} />;
}
