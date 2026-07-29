import { NextResponse, type NextRequest } from "next/server";

// Gate /admin/* behind a cookie whose value is sha256(ADMIN_PASSWORD).
// The password itself is never sent to the client and never stored in the
// cookie. /admin/login is public so the operator can sign in.

const PASSWORD = process.env.ADMIN_PASSWORD ?? "relay-admin-2026";

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/admin/login") || pathname.startsWith("/api/admin/login")) {
    return NextResponse.next();
  }
  const token = req.cookies.get("relay_admin")?.value;
  const expected = await sha256Hex(PASSWORD);
  if (token === expected) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/admin/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/admin/:path*"],
};
