import { ArticleDetailContent } from "@/components/articles/ArticleDetailContent";
import { getArticleBySlug } from "@/lib/articles";
import { getCurrentBusiness } from "@/lib/currentBusiness";

// Bug Audit 4 (2569-09-02): rendered per request (not statically at build)
// so the Nav can show the signed-in reader's credit balance, same as the
// list page — see components/articles/ArticleDetailContent.tsx.
export const dynamic = "force-dynamic";

// Agency-mode twin of app/articles/[slug]/page.tsx — see
// app/agency/articles/page.tsx for why this exists (keeps Agency-mode Nav
// chrome instead of dropping back to Clinic mode) and why it's safe to
// have two routes: both render the same ArticleDetailContent component
// against the same lib/articles.ts data, so there's nothing to keep in
// sync by hand.
export function generateMetadata({ params }: { params: { slug: string } }) {
  const article = getArticleBySlug(params.slug);
  if (!article) return {};
  return {
    title: `${article.title} — AdCheck`,
    description: article.excerpt,
  };
}

export default async function AgencyArticleDetailPage({ params }: { params: { slug: string } }) {
  const business = await getCurrentBusiness();
  return <ArticleDetailContent slug={params.slug} basePath="/agency/articles" credits={business?.credits_remaining} />;
}
