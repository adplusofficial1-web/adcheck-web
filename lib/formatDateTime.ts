// Shared Thai date+time formatting for admin timestamps (compliance_rules
// created_at/updated_at) — used by both the knowledge-base list
// (components/admin/KnowledgeBaseManager.tsx) and the history page
// (app/admin/knowledge-base/history/page.tsx) so the two always render an
// identical, full "วันที่ เวลา" format rather than each rolling its own.
//
// th-TH locale renders the Buddhist calendar year automatically (พ.ศ.),
// which is what a Thai admin expects to see, not ค.ศ.
//
// Accepts string | Date because @neondatabase/serverless returns
// timestamptz columns as native JS Date objects, not ISO strings — despite
// the ComplianceRule type in lib/complianceRules.ts declaring them as
// `string`. `new Date(x)` handles both correctly.
export function formatThaiDateTime(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleString("th-TH", {
    dateStyle: "long",
    timeStyle: "short",
  });
}

// Whether a row has been edited since creation. NOT a `!==` string/value
// comparison of the two fields directly — when the driver hands back Date
// objects, `createdAt !== updatedAt` compares object *references* and is
// therefore always true even for a row that was never touched after
// insert. Compare actual millisecond timestamps instead.
export function wasEdited(createdAt: string | Date, updatedAt: string | Date): boolean {
  const c = createdAt instanceof Date ? createdAt : new Date(createdAt);
  const u = updatedAt instanceof Date ? updatedAt : new Date(updatedAt);
  return c.getTime() !== u.getTime();
}
