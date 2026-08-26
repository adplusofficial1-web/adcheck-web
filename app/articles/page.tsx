import Link from "next/link";
import { Nav } from "@/components/Nav";
import { ARTICLES, type Article } from "@/lib/articles";

export const metadata = {
  title: "บทความ — AdCheck",
  description:
    "สรุปข่าวและประกาศจากหน่วยงานภาครัฐเกี่ยวกับการโฆษณาสถานพยาบาล คัดสรรและเรียบเรียงให้เข้าใจง่าย พร้อมลิงก์ไปต้นฉบับทุกบทความ",
};

function formatThaiDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" });
}

function SourceBadge({ article, className = "" }: { article: Article; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs text-tertiary ${className}`}>
      <svg width="13" height="13" viewBox="0 0 20 20" fill="none" className="shrink-0 text-accent">
        <path
          d="M10 1.5 3 4.5v4c0 4.4 2.9 8.4 7 9.5 4.1-1.1 7-5.1 7-9.5v-4L10 1.5Z"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
        <path d="m6.8 10 2.2 2.2 4.2-4.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>
        {article.sourceType === "official" ? "แหล่งข้อมูลทางการ" : "อ้างอิงข้อมูลภาครัฐ"} · {article.source}
      </span>
    </span>
  );
}

export default function ArticlesPage() {
  const [featured, ...rest] = ARTICLES;

  return (
    <main>
      <Nav />

      <div className="max-w-5xl mx-auto px-6 py-14">
        <p className="text-xs text-tertiary mb-3">หน้าแรก &nbsp;/&nbsp; บทความ</p>
        <h1 className="text-3xl font-medium mb-3">บทความและอัปเดตกฎหมาย</h1>
        <p className="text-secondary max-w-2xl mb-6">
          สรุปข่าวและประกาศจากหน่วยงานภาครัฐเกี่ยวกับการโฆษณาสถานพยาบาล เพื่อให้ทีมการตลาดคลินิกติดตามความเคลื่อนไหวได้ง่ายขึ้น
        </p>

        {/* Trust bar — makes the sourcing model explicit up front */}
        <div className="rounded-lg border border-border bg-accentSoft/40 px-6 py-4 mb-12 flex flex-col md:flex-row md:items-center gap-3 md:gap-6">
          <span className="inline-flex items-center gap-2 text-sm font-medium text-accent shrink-0">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              <path
                d="M10 1.5 3 4.5v4c0 4.4 2.9 8.4 7 9.5 4.1-1.1 7-5.1 7-9.5v-4L10 1.5Z"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
              <path d="m6.8 10 2.2 2.2 4.2-4.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            ทุกบทความอ้างอิงต้นฉบับได้จริง
          </span>
          <p className="text-xs text-secondary">
            เนื้อหาสรุปจากประกาศและข่าวของกรมสนับสนุนบริการสุขภาพ (สบส.) กระทรวงสาธารณสุข และสื่อที่อ้างอิงข้อมูลจากหน่วยงานภาครัฐโดยตรง
            พร้อมลิงก์ไปยังต้นฉบับในทุกบทความ — ไม่ใช่คำแนะนำทางกฎหมาย กรุณาตรวจสอบข้อมูลล่าสุดกับหน่วยงานต้นทางก่อนนำไปอ้างอิง
          </p>
        </div>

        {/* Featured article */}
        <Link
          href={`/articles/${featured.slug}`}
          className="block rounded-lg border border-border p-8 mb-6 hover:border-accent transition-colors"
        >
          <span className="inline-block rounded-pill bg-accentSoft text-accent text-xs font-medium px-3 py-1 mb-4">
            {featured.category}
          </span>
          <h2 className="text-2xl font-medium mb-3">{featured.title}</h2>
          <p className="text-secondary mb-4">{featured.excerpt}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <SourceBadge article={featured} />
            <span className="text-xs text-tertiary">{formatThaiDate(featured.publishedAt)}</span>
          </div>
        </Link>

        {/* Rest of the list */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {rest.map((article) => (
            <Link
              key={article.slug}
              href={`/articles/${article.slug}`}
              className="block rounded-lg border border-border p-6 hover:border-accent transition-colors"
            >
              <span className="inline-block rounded-pill bg-accentSoft text-accent text-xs font-medium px-3 py-1 mb-3">
                {article.category}
              </span>
              <h3 className="text-lg font-medium mb-2">{article.title}</h3>
              <p className="text-sm text-secondary mb-4">{article.excerpt}</p>
              <div className="flex flex-col gap-1">
                <SourceBadge article={article} />
                <span className="text-xs text-tertiary">{formatThaiDate(article.publishedAt)}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <footer className="bg-inverse text-onInverse text-center py-12 mt-8">
        <h3 className="text-lg font-medium mb-4">อยากให้ AdCheck ช่วยตรวจสอบโฆษณาก่อนเผยแพร่ไหม</h3>
        <Link href="/login" className="inline-block rounded-md bg-white text-inverse px-5 py-3 text-sm font-medium">
          ทดลองใช้ฟรี 5 ครั้ง
        </Link>
      </footer>
    </main>
  );
}
