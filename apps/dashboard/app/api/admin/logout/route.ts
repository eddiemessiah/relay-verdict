import { NextResponse } from "next/server";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("relay_admin", "", { path: "/", maxAge: 0 });
  return res;
}
