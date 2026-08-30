import { sql } from "@/lib/db";
import { stripNulBytes } from "@/lib/validation";

// "รายงานปัญหา" — a signed-in business reports one or more problem
// categories from /report-problem (components/ReportProblemForm.tsx),
// each with its own required detail. Submissions land in the admin inbox
// at /admin/reports (components/admin/IssueReportsManager.tsx). See
// migrations/005_issue_reports.sql for the schema this assumes.
//
// CATEGORIES/CATEGORY_LABEL live in lib/issueCategories.ts, NOT here —
// this module imports `sql` from lib/db.ts (which calls neon() at import
// time), so anything client-side that value-imports from this file drags
// that DB init into the browser bundle. Re-exported below purely so
// existing server-side imports (app/api/report-issue/route.ts) don't need
// to change; a "use client" component must import the categories
// directly from lib/issueCategories.ts instead. See that file's comment
// for the crash this split fixes.
export { CATEGORIES, CATEGORY_LABEL } from "@/lib/issueCategories";

export type IssueReportItem = { category: string; label: string; detail: string };

export type IssueReportStatus = "new" | "in_progress" | "resolved";

export type IssueReport = {
  id: string;
  business_id: string;
  business_name: string;
  contact_email: string | null;
  items: IssueReportItem[];
  message: string | null;
  status: IssueReportStatus;
  created_at: string;
  updated_at: string;
};

export async function createIssueReport(
  businessId: string,
  contactEmail: string | null,
  items: IssueReportItem[],
  message: string | null
) {
  const cleanItems = items.map((it) => ({
    category: it.category,
    label: it.label,
    detail: stripNulBytes(it.detail).trim(),
  }));
  const cleanMessage = message ? stripNulBytes(message).trim() || null : null;

  const [row] = await sql`
    INSERT INTO issue_reports (business_id, contact_email, items, message)
    VALUES (${businessId}, ${contactEmail}, ${JSON.stringify(cleanItems)}::jsonb, ${cleanMessage})
    RETURNING id, created_at
  `;
  return row as { id: string; created_at: string };
}

// Admin inbox list — joins businesses for the clinic name (contact_email
// on the report itself is already a self-contained snapshot, so this join
// is only for the name). No status filter here: the admin UI filters
// client-side the same way KnowledgeBaseManager's search box does, since
// report volume is expected to be small enough that fetching everything
// once is simpler than a paginated/filtered API.
export async function listIssueReports(): Promise<IssueReport[]> {
  const rows = await sql`
    SELECT r.id, r.business_id, b.name AS business_name, r.contact_email, r.items,
      r.message, r.status, r.created_at, r.updated_at
    FROM issue_reports r
    JOIN businesses b ON b.id = r.business_id
    ORDER BY r.created_at DESC
  `;
  return rows as any[];
}

export async function updateIssueReportStatus(id: string, status: IssueReportStatus) {
  const [row] = await sql`
    UPDATE issue_reports
    SET status = ${status}, updated_at = now()
    WHERE id = ${id}
    RETURNING id, status, updated_at
  `;
  return (row as any) ?? null;
}
