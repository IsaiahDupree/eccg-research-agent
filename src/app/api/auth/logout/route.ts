import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = url.searchParams.get("redirect") || "/";
  const res = NextResponse.redirect(new URL(back, req.url));
  res.headers.set("set-cookie", clearSessionCookie());
  return res;
}

export async function POST(req: Request) {
  return GET(req);
}
