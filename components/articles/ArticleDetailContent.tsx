import Link from "next/link";
import { notFound } from "next/navigation";
import { Nav } from "@/components/Nav";
import { ARTICLES, getArticleBySlug } from "@/lib/articles";

const SITE_URL = "https://adcheck.pro";

// FIX (bug audit round 3) — see the identical comment in
// components/articles/ArticlesListContent.tsx: no `timeZone` means the
// date is rendered in whatever timezone the process happens to run in,
// which can show the wrong calendar day for anything published between
// 00:00-06:59 Thailand time.
function formatThaiDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Bangkok" });
}

// Shared "บทความ" detail UI for both /articles/[slug] (clinic mode) and
// /agency/articles/[slug] (agency mode) — see ArticlesListContent.tsx for
// why this is one shared component rather than two copies (same article
// content either way, nothing to keep in sync by hand). basePath is used
// to build the breadcrumb / back link and the "more articles" links so
// browsing stays inside whichever mode the reader arrived from.
//
// Bug Audit 4 (2569-09-02): `credits` was never passed here (only the list
// page got that fix in audit 3), so opening any article made the
// "เครดิตคงเหลือ" badge vanish from the Nav until the reader left the page.
//
// SEO: the JSON-LD below always points at the canonical /articles/ URL
// (never /agency/articles/) regardless of which basePath rendered this
// page, matching the canonical tag set in
// app/agency/articles/[slug]/page.tsx — Google should only ever associate
// this structured data with one URL. dateModified is set equal to
// publishedAt rather than invented, since lib/articles.ts's Article type
// has no separate "last edited" field to draw a real one from.
export function ArticleDetailContent({
  slug,
  basePath = "/articles",
  credits,
}: {
  slug: string;
  basePath?: string;
  credits?: number;
}) {
  const article = getArticleBySlug(slug);
  if (!article) notFound();

  const more = ARTICLES.filter((a) => a.slug !== article.slug).slice(0, 2);

  const canonicalUrl = `${SITE_URL}/articles/${article.slug}`;
  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.excerpt,
    datePublished: article.publishedAt,
    dateModified: article.publishedAt,
    mainEntityOfPage: canonicalUrl,
    url: canonicalUrl,
    author: { "@type": "Organization", name: "AdCheck" },
    publisher: { "@type": "Organization", name: "AdCheck" },
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "หน้าแรก", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "บทความ", item: `${SITE_URL}/articles` },
      { "@type": "ListItem", position: 3, name: article.title, item: canonicalUrl },
    ],
  };

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <Nav credits={credits} />

      <article className="max-w-3xl mx-auto px-6 py-14">
        <p className="text-xs text-tertiary mb-3">
          <Link href={basePath} className="hover:underline">
            หน้าแรก &nbsp;/&nbsp; บทความ
          </Link>
          &nbsp;/&nbsp; {article.title}
        </p>

        <span className="inline-block rounded-pill bg-accentSoft text-accent text-xs font-medium px-3 py-1 mb-4">
          {article.category}
        </span>

        <h1 className="text-3xl font-medium mb-3 leading-tight">{article.title}</h1>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-10">
          <span className="inline-flex items-center gap-1.5 text-xs text-tertiary">
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none" className="shrink-0 text-accent">
              <path
                d="M10 1.5 3 4.5v4c0 4.4 2.9 8.4 7 9.5 4.1-1.1 7-5.1 7-9.5v-4L10 1.5Z"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinejoin="round"
              />
              <path d="m6.8 10 2.2 2.2 4.2-4.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {article.sourceType === "official" ? "แหล่งข้อมูลทางการ" : "อ้างอิงข้อมูลภาครัฐ"} · {article.source}
          </span>
          <span className="text-xs text-tertiary">{formatThaiDate(article.publishedAt)}</span>
        </div>

        <div className="space-y-4 text-secondary leading-relaxed mb-10">
          {article.body.map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </div>

        <div className="rounded-lg border border-border bg-page p-5 mb-10">
          <p className="text-sm font-medium text-primary mb-1">ที่มา</p>
          <p className="text-sm text-secondary mb-2">
            บทความนี้สรุปและเรียบเรียงจาก{" "}
            <a
              href={article.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline"
            >
              {article.source}
            </a>
            . โปรดตรวจสอบข้อมูลล่าสุดกับหน่วยงานต้นทางก่อนนำไปใช้อ้างอิงทางกฎหมาย เนื้อหานี้ไม่ใช่คำแนะนำทางกฎหมาย
          </p>
        </div>

        <Link href={basePath} className="text-sm underline">
          ← กลับไปหน้าบทความ
        </Link>

        {more.length > 0 && (
          <div className="mt-14 pt-10 border-t border-border">
            <h2 className="text-lg font-medium mb-6">บทความอื่นๆ</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {more.map((a) => (
                <Link
                  key={a.slug}
                  href={`${basePath}/${a.slug}`}
                  className="block rounded-lg border border-border p-6 hover:border-accent transition-colors"
                >
                  <span className="inline-block rounded-pill bg-accentSoft text-accent text-xs font-medium px-3 py-1 mb-3">
                    {a.category}
                  </span>
                  <h3 className="text-base font-medium mb-2">{a.title}</h3>
                  <p className="text-xs text-tertiary">{formatThaiDate(a.publishedAt)}</p>
                </Link>
              ))}
            </div>
          </div>
        )}
      </article>
    </main>
  );
}
