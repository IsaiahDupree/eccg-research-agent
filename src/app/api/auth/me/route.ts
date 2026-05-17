import { NextResponse } from "next/server";
import { isSessionConfigured, readSessionFromRequest } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = readSessionFromRequest(req);
  return NextResponse.json({
    configured: isSessionConfigured(),
    signed_in: Boolean(session),
    email: session?.email ?? null,
    name: session?.name ?? null,
    picture: session?.picture ?? null,
  });
}
