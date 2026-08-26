import { ArticleDetailContent } from "@/components/articles/ArticleDetailContent";
import { ARTICLES, getArticleBySlug } from "@/lib/articles";

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

export default function ArticleDetailPage({ params }: { params: { slug: string } }) {
  return <ArticleDetailContent slug={params.slug} basePath="/articles" />;
}
