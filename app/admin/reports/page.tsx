import { listIssueReports } from "@/lib/issueReports";
import { IssueReportsManager } from "@/components/admin/IssueReportsManager";

// Same reasoning as app/admin/marketing/page.tsx's dynamic export — an
// admin marking a report resolved and immediately checking the inbox
// wants the current list, not a cached one.
export const dynamic = "force-dynamic";

export default async function AdminReportsPage() {
  const reports = await listIssueReports();
  const newCount = reports.filter((r) => r.status === "new").length;

  return (
    <div className="max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-medium text-primary">รายงานปัญหา</h1>
        <p className="mt-2 text-sm text-secondary max-w-2xl">
          ปัญหาที่คลินิก/เอเจนซี่รายงานเข้ามาจากหน้า &ldquo;รายงานปัญหา&rdquo; ใน /settings — แต่ละรายการมีหัวข้อที่เลือกไว้
          พร้อมรายละเอียด
        </p>
        <p className="mt-3 text-xs text-tertiary">ยังไม่ได้ดำเนินการ {newCount} รายการ จากทั้งหมด {reports.length} รายการ</p>
      </div>

      <div className="mt-8">
        <IssueReportsManager initialReports={reports} />
      </div>
    </div>
  );
}
