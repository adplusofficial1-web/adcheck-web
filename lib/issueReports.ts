import { sql } from "@/lib/db";

// "รายงานปัญหา" — a signed-in business reports one or more problem
// categories from /report-problem (components/ReportProblemForm.tsx),
// each with its own required detail. Submissions land in the admin inbox
// at /admin/reports (components/admin/IssueReportsManager.tsx). See
// migrations/005_issue_reports.sql for the schema this assumes.
//
// The category list lives here (not duplicated in the form component and
// the admin page) so both always agree on the same ids/labels — the form
// renders CATEGORIES to build its checklist, and the admin inbox falls
// back to CATEGORY_LABEL[id] only for older rows that predate a label
// rename (a submitted row's own `label` snapshot is preferred otherwise,
// see IssueReportItem below).
export const CATEGORIES: { id: string; label: string }[] = [
  { id: "wrong_review_result", label: "ผลตรวจภาพไม่ถูกต้อง (ระบบ flag ผิด/พลาด)" },
  { id: "upload_issue", label: "ปัญหาการอัพโหลดภาพ" },
  { id: "billing_credits", label: "ปัญหาการชำระเงิน/แพ็กเกจ/เครดิต" },
  { id: "login_account", label: "ปัญหาการเข้าสู่ระบบ/บัญชี" },
  { id: "bug_broken_page", label: "หน้าเว็บใช้งานไม่ได้/บั๊ก" },
  { id: "other", label: "ข้อเสนอแนะอื่นๆ" },
];

export const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c.label])
);

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

// Postgres text/jsonb columns reject the NUL byte — same defensive strip
// as app/api/admin/knowledge-base/route.ts's stripNulBytes, applied here
// since this form's free-text fields (detail, message) are just as
// capable of carrying a stray NUL from a bad paste.
const NUL = String.fromCharCode(0);
function stripNulBytes(text: string): string {
  return text.split(NUL).join("");
}

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
