import { ArticlesListContent } from "@/components/articles/ArticlesListContent";
import { getCurrentBusiness } from "@/lib/currentBusiness";

// Agency-mode twin of app/articles/page.tsx — lives under /agency/... so
// components/Nav.tsx's path-prefix check keeps Agency-mode chrome instead
// of dropping back to Clinic-mode chrome (the bug this route fixes).
// Renders the exact same ArticlesListContent component with the same
// article data (lib/articles.ts) — there are two routes but one shared
// implementation, so the content is always identical between modes with
// nothing to keep in sync by hand.
export const metadata = {
  title: "บทความ — AdCheck",
  description:
    "สรุปข่าวและประกาศจากหน่วยงานภาครัฐเกี่ยวกับการโฆษณาสถานพยาบาล คัดสรรและเรียบเรียงให้เข้าใจง่าย พร้อมลิงก์ไปต้นฉบับทุกบทความ",
};

// Same fix as app/articles/page.tsx — this route never passed credits to
// Nav either, so "เครดิตรวม" never showed on /agency/articles.
export default async function AgencyArticlesPage() {
  const business = await getCurrentBusiness();
  return <ArticlesListContent basePath="/agency/articles" credits={business?.credits_remaining} />;
}
