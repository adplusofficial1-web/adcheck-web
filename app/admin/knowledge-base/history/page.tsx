import Link from "next/link";
import { listComplianceRules } from "@/lib/complianceRules";
import { formatThaiDateTime, wasEdited } from "@/lib/formatDateTime";

export const dynamic = "force-dynamic";

// Chronological log of every entry currently in the knowledge base, sorted
// by when it was added (listComplianceRules() with no search query already
// orders by created_at DESC — reused as-is rather than adding a second
// query path).
//
// Known limitation: this reflects rows that exist RIGHT NOW, not a true
// append-only audit trail — compliance_rules does hard deletes (see
// lib/complianceRules.ts:deleteComplianceRule), so a rule that was added
// and later deleted leaves no trace here. That's fine for "ประวัติการเพิ่ม"
// (history of what has been added) as asked, but if a full add/edit/delete
// audit log is needed later, that requires a separate append-only table —
// out of scope for this page.
export default async function KnowledgeBaseHistoryPage() {
  const rules = await listComplianceRules();

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium text-primary">ประวัติการเพิ่มคลังความรู้</h1>
          <p className="mt-1 text-sm text-secondary">
            เรียงตามวันเวลาที่เพิ่มล่าสุดก่อน ทั้งหมด {rules.length} รายการ (รวมรายการที่ปิดใช้งานอยู่)
          </p>
        </div>
        <Link href="/admin/knowledge-base" className="shrink-0 text-sm text-accent hover:underline whitespace-nowrap">
          ← กลับไปหน้าคลังความรู้
        </Link>
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-page border-b border-border text-left text-xs text-tertiary">
              <th className="px-4 py-3 font-medium">หัวข้อ</th>
              <th className="px-4 py-3 font-medium">หมวดหมู่</th>
              <th className="px-4 py-3 font-medium">แหล่งที่มา</th>
              <th className="px-4 py-3 font-medium">เพิ่มโดย</th>
              <th className="px-4 py-3 font-medium">วันเวลาที่เพิ่ม</th>
              <th className="px-4 py-3 font-medium">แก้ไขล่าสุด</th>
              <th className="px-4 py-3 font-medium">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => {
              const edited = wasEdited(rule.created_at, rule.updated_at);
              return (
                <tr key={rule.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 text-primary max-w-xs truncate">{rule.title}</td>
                  <td className="px-4 py-3 text-secondary whitespace-nowrap">{rule.category || "—"}</td>
                  <td className="px-4 py-3 text-secondary whitespace-nowrap">
                    {rule.source_type === "upload" ? `ไฟล์: ${rule.source_filename ?? ""}` : "พิมพ์เอง"}
                  </td>
                  <td className="px-4 py-3 text-secondary whitespace-nowrap">{rule.created_by || "—"}</td>
                  <td className="px-4 py-3 text-secondary whitespace-nowrap">
                    {formatThaiDateTime(rule.created_at)}
                  </td>
                  <td className="px-4 py-3 text-secondary whitespace-nowrap">
                    {edited ? formatThaiDateTime(rule.updated_at) : "—"}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={`rounded-pill px-2.5 py-0.5 text-xs ${
                        rule.is_active ? "bg-accentSoft text-accent" : "bg-dangerSoft text-danger"
                      }`}
                    >
                      {rule.is_active ? "เปิดใช้งาน" : "ปิดใช้งาน"}
                    </span>
                  </td>
                </tr>
              );
            })}
            {rules.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-tertiary">
                  ยังไม่มีข้อมูลในคลังความรู้
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
