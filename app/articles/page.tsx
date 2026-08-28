import { ArticlesListContent } from "@/components/articles/ArticlesListContent";
import { getCurrentBusiness } from "@/lib/currentBusiness";

export const metadata = {
  title: "บทความ — AdCheck",
  description:
    "สรุปข่าวและประกาศจากหน่วยงานภาครัฐเกี่ยวกับการโฆษณาสถานพยาบาล คัดสรรและเรียบเรียงให้เข้าใจง่าย พร้อมลิงก์ไปต้นฉบับทุกบทความ",
};

// Public route (see middleware.ts) — getCurrentBusiness() returns null for
// a logged-out visitor, so credits stays undefined and Nav just hides the
// pill, same as it always has elsewhere. For a signed-in visitor this is
// what was missing: every other Nav-bearing page passes credits, this one
// never did.
export default async function ArticlesPage() {
  const business = await getCurrentBusiness();
  return <ArticlesListContent basePath="/articles" credits={business?.credits_remaining} />;
}
