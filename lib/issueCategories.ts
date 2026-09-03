// Pure, client-safe category list for "รายงานปัญหา" — deliberately split out
// of lib/issueReports.ts, which also exports DB-backed functions that
// import `sql` from lib/db.ts (and that module calls neon() at import
// time). components/ReportProblemForm.tsx is a "use client" component, so
// a value-import of CATEGORIES straight from lib/issueReports.ts pulled
// the ENTIRE module — including lib/db.ts's neon() init — into the
// browser bundle, which crashed immediately with "No database connection
// string was provided to neon()" the moment /report-problem loaded
// (DATABASE_URL is a server-only env var, never exposed client-side).
// Keeping this list in its own DB-free file means the client form can
// import it directly without ever touching server-only code.
export const CATEGORIES: { id: string; label: string }[] = [
  { id: "wrong_review_result", label: "ผลตรวจภาพไม่ถูกต้อง (ระบบ flag ผิด/พลาด)" },
  { id: "upload_issue", label: "ปัญหาการอัปโหลดภาพ" },
  { id: "billing_credits", label: "ปัญหาการชำระเงิน/แพ็กเกจ/เครดิต" },
  { id: "login_account", label: "ปัญหาการเข้าสู่ระบบ/บัญชี" },
  { id: "bug_broken_page", label: "หน้าเว็บใช้งานไม่ได้/บั๊ก" },
  { id: "other", label: "ข้อเสนอแนะอื่นๆ" },
];

export const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c.label])
);
