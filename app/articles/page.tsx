import { ArticlesListContent } from "@/components/articles/ArticlesListContent";
import { getCurrentBusiness } from "@/lib/currentBusiness";

// SEO audit (OpenRush, 2569-09-05): title was too short (16 chars) and this
// page had no self-referencing canonical — both fixed here.
export const metadata = {
  title: "บทความข่าวและกฎหมายโฆษณาคลินิก — AdCheck",
  description:
    "สรุปข่าวและประกาศจากหน่วยงานภาครัฐเกี่ยวกับการโฆษณาสถานพยาบาล คัดสรรและเรียบเรียงให้เข้าใจง่าย พร้อมลิงก์ไปต้นฉบับทุกบทความ",
  alternates: {
    canonical: "/articles",
  },
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
