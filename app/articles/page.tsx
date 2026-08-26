import { ArticlesListContent } from "@/components/articles/ArticlesListContent";

export const metadata = {
  title: "บทความ — AdCheck",
  description:
    "สรุปข่าวและประกาศจากหน่วยงานภาครัฐเกี่ยวกับการโฆษณาสถานพยาบาล คัดสรรและเรียบเรียงให้เข้าใจง่าย พร้อมลิงก์ไปต้นฉบับทุกบทความ",
};

export default function ArticlesPage() {
  return <ArticlesListContent basePath="/articles" />;
}
