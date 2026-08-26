// Shared Thai date+time formatting for admin timestamps (compliance_rules
// created_at/updated_at) — used by both the knowledge-base list
// (components/admin/KnowledgeBaseManager.tsx) and the history page
// (app/admin/knowledge-base/history/page.tsx) so the two always render an
// identical, full "วันที่ เวลา" format rather than each rolling its own.
//
// th-TH locale renders the Buddhist calendar year automatically (พ.ศ.),
// which is what a Thai admin expects to see, not ค.ศ.
export function formatThaiDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("th-TH", {
    dateStyle: "long",
    timeStyle: "short",
  });
}
