import { ArticleDetailContent } from "@/components/articles/ArticleDetailContent";
import { getArticleBySlug } from "@/lib/articles";
import { getCurrentBusiness } from "@/lib/currentBusiness";

// Bug Audit 4 (2569-09-02): rendered per request (not statically at build)
// so the Nav can show the signed-in reader's credit balance, same as the
// list page — see components/articles/ArticleDetailContent.tsx.
export const dynamic = "force-dynamic";

// SEO audit (OpenRush, 2569-09-05): this page had no self-referencing
// canonical, and two articles' full `title` ran past ~60 chars once the
// " — AdCheck" suffix was added (flagged title_too_long). Fixed by adding
// the canonical and by preferring the new optional `article.metaTitle`
// (a shorter version, set only on those two articles in lib/articles.ts)
// for the <title> tag — the on-page <h1> still renders the full
// `article.title` unchanged.
export function generateMetadata({ params }: { params: { slug: string } }) {
  const article = getArticleBySlug(params.slug);
  if (!article) return {};
  return {
    title: `${article.metaTitle ?? article.title} — AdCheck`,
    description: article.excerpt,
    alternates: {
      canonical: `/articles/${article.slug}`,
    },
  };
}

export default async function ArticleDetailPage({ params }: { params: { slug: string } }) {
  const business = await getCurrentBusiness();
  return <ArticleDetailContent slug={params.slug} basePath="/articles" credits={business?.credits_remaining} />;
}
