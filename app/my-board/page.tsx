import { requireUser } from "../lib/auth/session";
import PersonalBoardClient from "./personal-board-client";

export const dynamic = "force-dynamic";

export default async function PersonalBoardPage() {
  const user = await requireUser();
  return <PersonalBoardClient viewer={{ displayName: user.displayName, role: user.role }} />;
}
