import Link from "next/link";
import { listComplianceRules, countActiveComplianceRules } from "@/lib/complianceRules";
import { KnowledgeBaseManager } from "@/components/admin/KnowledgeBaseManager";

// Always hit the DB fresh — an admin editing a rule and immediately
// checking the list is the whole point of this page, so any caching here
// would be actively confusing (same reasoning as the `fetchOptions:
// { cache: "no-store" }` note in lib/db.ts).
export const dynamic = "force-dynamic";

export default async function KnowledgeBasePage() {
  const [rules, activeCount] = await Promise.all([listComplianceRules(), countActiveComplianceRules()]);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium text-primary">คลังความรู้กฎหมาย</h1>
          <p className="mt-2 text-sm text-secondary max-w-2xl">
            ข้อมูลในหน้านี้คือแหล่งความรู้เดียวที่ระบบ AI ใช้ตรวจสอบภาพโฆษณา — เมื่อตรวจภาพ ระบบจะค้นหาเฉพาะรายการที่
            &ldquo;เปิดใช้งาน&rdquo; อยู่และเกี่ยวข้องกับบริบทของภาพนั้น แล้วส่งให้ Claude วิเคราะห์
            <strong className="text-primary"> โดยไม่ใช้ความรู้กฎหมายอื่นนอกเหนือจากนี้</strong>{" "}
            ความถูกต้องและความครบถ้วนของกฎหมายที่พิมพ์/อัพโหลดไว้ที่นี่จึงมีผลโดยตรงต่อความแม่นยำของผลตรวจทุกภาพ
          </p>
          <p className="mt-3 text-xs text-tertiary">กำลังเปิดใช้งานอยู่ {activeCount} รายการ</p>
        </div>
        <Link
          href="/admin/knowledge-base/history"
          className="shrink-0 text-sm text-accent hover:underline whitespace-nowrap"
        >
          ดูประวัติการเพิ่มทั้งหมด →
        </Link>
      </div>

      <div className="mt-8">
        <KnowledgeBaseManager initialRules={rules} />
      </div>
    </div>
  );
}
