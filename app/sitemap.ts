import type { MetadataRoute } from "next";
import { ARTICLES } from "@/lib/articles";

const SITE_URL = "https://adcheck.pro";

// Only canonical URLs go here — the /agency/... twins of these pages
// (see app/agency/articles/page.tsx etc.) carry a rel=canonical back to
// these same paths, so listing both would just tell Google to split
// ranking signal across two URLs for the same content.
export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/pricing`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/about`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/case-studies`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/articles`, changeFrequency: "daily", priority: 0.9 },
  ];

  const articleRoutes: MetadataRoute.Sitemap = ARTICLES.map((article) => ({
    url: `${SITE_URL}/articles/${article.slug}`,
    lastModified: article.publishedAt,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  return [...staticRoutes, ...articleRoutes];
}
