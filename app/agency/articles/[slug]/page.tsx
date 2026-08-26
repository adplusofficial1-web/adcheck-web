import { ArticleDetailContent } from "@/components/articles/ArticleDetailContent";
import { ARTICLES, getArticleBySlug } from "@/lib/articles";

// Agency-mode twin of app/articles/[slug]/page.tsx — see
// app/agency/articles/page.tsx for why this exists (keeps Agency-mode Nav
// chrome instead of dropping back to Clinic mode) and why it's safe to
// have two routes: both render the same ArticleDetailContent component
// against the same lib/articles.ts data, so there's nothing to keep in
// sync by hand.
export function generateStaticParams() {
  return ARTICLES.map((a) => ({ slug: a.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const article = getArticleBySlug(params.slug);
  if (!article) return {};
  return {
    title: `${article.title} — AdCheck`,
    description: article.excerpt,
  };
}

export default function AgencyArticleDetailPage({ params }: { params: { slug: string } }) {
  return <ArticleDetailContent slug={params.slug} basePath="/agency/articles" />;
}
