import { ArticlesListContent } from "@/components/articles/ArticlesListContent";
import { getCurrentBusiness } from "@/lib/currentBusiness";

// Agency-mode twin of app/articles/page.tsx — lives under /agency/... so
// components/Nav.tsx's path-prefix check keeps Agency-mode chrome instead
// of dropping back to Clinic-mode chrome (the bug this route fixes).
// Renders the exact same ArticlesListContent component with the same
// article data (lib/articles.ts) — there are two routes but one shared
// implementation, so the content is always identical between modes with
// nothing to keep in sync by hand.
//
// SEO: identical content to /articles, so this points its canonical back
// at the main route instead of competing with it for the same search
// queries — Google should only ever rank one URL for this content. Title
// kept identical to app/articles/page.tsx's (updated together, 2569-09-05)
// so a shared /agency/articles link previews the same way.
export const metadata = {
  title: "บทความข่าวและกฎหมายโฆษณาคลินิก — AdCheck",
  description:
    "สรุปข่าวและประกาศจากหน่วยงานภาครัฐเกี่ยวกับการโฆษณาสถานพยาบาล คัดสรรและเรียบเรียงให้เข้าใจง่าย พร้อมลิงก์ไปต้นฉบับทุกบทความ",
  alternates: {
    canonical: "/articles",
  },
};

// Same fix as app/articles/page.tsx — this route never passed credits to
// Nav either, so "เครดิตรวม" never showed on /agency/articles.
export default async function AgencyArticlesPage() {
  const business = await getCurrentBusiness();
  return <ArticlesListContent basePath="/agency/articles" credits={business?.credits_remaining} />;
}
