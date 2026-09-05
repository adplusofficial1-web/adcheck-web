import type { MetadataRoute } from "next";

// Keeps the crawl budget on pages that can actually rank (marketing pages,
// /articles) and out of anything that's private, transactional, or would
// otherwise show up as thin/duplicate content in search results — none of
// this changes what a signed-in user can reach, it only tells crawlers
// what's worth indexing. See app/sitemap.ts for the canonical URL list.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/admin/",
          "/api/",
          "/dashboard",
          "/dashboard/",
          "/agency/dashboard",
          "/agency/dashboard/",
          "/results/",
          "/agency/results/",
          "/processing/",
          "/settings",
          "/settings/",
          "/agency/settings",
          "/agency/settings/",
          "/history",
          "/history/",
          "/hunter",
          "/hunter/",
          "/sales",
          "/sales/",
          "/report-problem",
          "/report-problem/",
          "/share/",
          "/checkout",
          "/checkout/",
          "/agency/checkout",
          "/agency/checkout/",
        ],
      },
    ],
    sitemap: "https://adcheck.pro/sitemap.xml",
  };
}
