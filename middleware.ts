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
//
// ADDED (Sales Lead Distribution, 2026-09-01): /sales/:path* and
// /api/sales/:path* — same belt-and-suspenders-only role as /admin above,
// not real gating. /sales itself and every /api/sales/** route each check
// lib/currentSalesUser.ts's getCurrentSalesUser() themselves and
// redirect/401 on their own (fail-closed), following the exact same
// per-route convention as the platform admin area rather than relying on
// this middleware (there's still no `authorized` callback configured).
// /sales/:path* also matches /sales/login itself, same as /admin/:path*
// matches every /admin/* page — harmless, since this handler never
// redirects or blocks anything, it only forwards x-pathname (see below).
//
// ADDED (Hunter Freelancer Page, 2026-09-01): /hunter/:path* and
// /api/hunter/:path* — same belt-and-suspenders-only role, not real
// gating. /hunter itself and GET /api/hunter/leads each check
// lib/currentHunterUser.ts's getCurrentHunterUser() themselves and
// redirect/403 on their own (fail-closed), following the exact same
// per-route convention as /sales and /admin. This is a NEW top-level area,
// separate from /admin/marketing/hunter (which stays under /admin/:path*
// above, platform-admin-only) — see app/hunter/page.tsx.
//
// ADDED (Hunter Referral Commission, 2569-09-01): "/login" added to the
// matcher (previously not matched at all) purely so this handler can see
// the `ref` query param on a Hunter's referral link
// (https://adcheck.pro/login?ref=<hunter_user_id>) and stash it in a
// short-lived cookie BEFORE the Google OAuth round trip — the query param
// itself doesn't survive that redirect, and a business row isn't actually
// created until the clinic's first protected-page load after sign-in (see
// lib/currentBusiness.ts:getCurrentBusiness(), which is where the cookie
// is later read and validated). This still isn't real gating — /login
// renders exactly as before for every request, this only ever adds a
// cookie, never blocks or redirects.
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

  // Hunter Referral Commission (2569-09-01): capture ?ref=<hunter_user_id>
  // on /login into a cookie. Validated for real (is it an actual, active
  // hunter_users row?) only later in lib/currentBusiness.ts, right before
  // it would be written to businesses.referred_by_hunter_user_id — this
  // middleware runs on the edge auth bundle and deliberately avoids
  // reaching into lib/db.ts's Neon client here (same reasoning auth.ts's
  // own comment gives for keeping that client out of this bundle). 30-day
  // expiry is generous slack for "clinic opens the link today, actually
  // signs in a few days later" without living forever.
  if (req.nextUrl.pathname === "/login") {
    const ref = req.nextUrl.searchParams.get("ref");
    // Bug Audit 4 (2569-09-02): only stash a UUID-shaped value. Anything
    // else (a mangled/truncated link, `?ref=abc` posted by someone hostile)
    // used to be stored for 30 days and then crash lib/currentBusiness.ts's
    // lazy-create branch for that visitor on every page — effectively a
    // sign-up denial of service via a single shared link. Same regex as
    // lib/validation.ts:isValidUuid, inlined because this file is part of
    // the edge auth bundle and deliberately imports nothing from lib/.
    if (ref && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref)) {
      res.cookies.set("hunter_ref", ref, {
        maxAge: 60 * 60 * 24 * 30,
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      });
    }
  }

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
          "/sales/:path*",
          "/api/sales/:path*",
          "/hunter/:path*",
          "/api/hunter/:path*",
          "/login",
        ],
};
