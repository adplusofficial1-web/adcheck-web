export { auth as middleware } from "@/auth";

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
        ],
};
