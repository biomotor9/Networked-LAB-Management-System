import { NextResponse } from "next/server";
import { destroyCurrentSession } from "../../../lib/auth/session";

export async function POST(request: Request) {
  await destroyCurrentSession();
  return NextResponse.redirect(new URL("/login", request.url), 303);
}

