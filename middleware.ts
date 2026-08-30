import { auth } from "@/auth";
import { NextResponse } from "next/server";

// Everything a signed-in business owner uses. /, /login, and /pricing stay
// public. Add new authenticated routes here as they're built.
//
// FIX (bug audit #10): the /agency/... twins of these same protected
// sections were missing entirely — every /agency/* page happened to be
// safe anyway because each one calls getCurrentBusiness() and redirects
// itself (see e.g. app/agency/dashboard/page.tsx), but that left this
// matcher as the ONLY layer of protection for the /agency/* side with no
// belt-and-suspenders backstop, unlike every clinic-side page listed here.
// /agency/about, /agency/articles, and /agency/pricing are intentionally
// left out — public marketing twins of /about, /articles, /pricing, same
// as those.
//
// FIX (bug audit round 2, low): /admin/* and /api/admin/* were entirely
// absent from this matcher — not an exploitable gap (app/admin/layout.tsx
// and every app/api/admin/** route already check
// getCurrentPlatformAdminEmail() themselves, fail-closed), but it meant the
// admin area had no belt-and-suspenders backstop the way every other
// section above does. Adding them here also lets the small wrapper below
// forward the real requested path to app/admin/layout.tsx (see next
// comment) — this middleware still performs no redirect/auth-gating of its
// own (no `authorized` callback is configured in auth.ts), so this is
// purely additive and doesn't change how any route is protected.
export default auth((req) => {
  // FIX (bug audit round 2, low): app/admin/layout.tsx used to hardcode
  // every signed-out redirect's callbackUrl to /admin/knowledge-base
  // regardless of which admin page was actually requested — an admin with
  // /admin/credits or /admin/reports bookmarked would always land back on
  // the knowledge base after signing in. Forwarding the real path/query via
  // a request header (the standard way an App Router Server Component
  // layout learns the current pathname, since it isn't otherwise passed to
  // a shared layout) lets that layout build the correct destination.
  const res = NextResponse.next();
  res.headers.set("x-pathname", req.nextUrl.pathname + req.nextUrl.search);
  return res;
});

export const config = {
    matcher: [
          "/dashboard/:path*",
          "/history/:path*",
          "/settings/:path*",
          "/upload/:path*",
          "/results/:path*",
          "/checkout/:path*",
          "/processing/:path*",
          "/agency/dashboard/:path*",
          "/agency/history/:path*",
          "/agency/settings/:path*",
          "/agency/upload/:path*",
          "/agency/checkout/:path*",
          "/agency/results/:path*",
          "/agency/processing/:path*",
          "/admin/:path*",
          "/api/admin/:path*",
        ],
};
