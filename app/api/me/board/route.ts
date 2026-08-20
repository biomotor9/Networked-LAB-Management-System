import { NextResponse } from "next/server";
import { requireUser } from "../../../lib/auth/session";
import { readPersonalBoard } from "../../../lib/dashboard/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const actor = await requireUser();
  return NextResponse.json(await readPersonalBoard(actor));
}
