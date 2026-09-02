import { ArticleDetailContent } from "@/components/articles/ArticleDetailContent";
import { getArticleBySlug } from "@/lib/articles";
import { getCurrentBusiness } from "@/lib/currentBusiness";

// Bug Audit 4 (2569-09-02): rendered per request (not statically at build)
// so the Nav can show the signed-in reader's credit balance, same as the
// list page — see components/articles/ArticleDetailContent.tsx.
export const dynamic = "force-dynamic";

export function generateMetadata({ params }: { params: { slug: string } }) {
  const article = getArticleBySlug(params.slug);
  if (!article) return {};
  return {
    title: `${article.title} — AdCheck`,
    description: article.excerpt,
  };
}

export default async function ArticleDetailPage({ params }: { params: { slug: string } }) {
  const business = await getCurrentBusiness();
  return <ArticleDetailContent slug={params.slug} basePath="/articles" credits={business?.credits_remaining} />;
}
