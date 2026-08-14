import { sql as query } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "../../../db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(query`select 1`);
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 503 });
  }
}
