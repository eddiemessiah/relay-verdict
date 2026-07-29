import { NextResponse } from "next/server";

// Verify the typed password against ADMIN_PASSWORD (server-only env) and, on
// success, set an httpOnly cookie = sha256(password). The password never
// reaches the client; the cookie carries only the hash the middleware checks.

const PASSWORD = process.env.ADMIN_PASSWORD ?? "relay-admin-2026";

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function POST(req: Request) {
  const { password } = await req.json().catch(() => ({ password: "" }));
  if (typeof password !== "string" || password !== PASSWORD) {
    return NextResponse.json({ error: "wrong password" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set("relay_admin", await sha256Hex(PASSWORD), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8, // 8 hours
  });
  return res;
}
