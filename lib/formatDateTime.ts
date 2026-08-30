// Shared Thai date+time formatting for admin timestamps (compliance_rules
// created_at/updated_at, credit grant history, issue reports) — used by
// KnowledgeBaseManager.tsx, the history page
// (app/admin/knowledge-base/history/page.tsx), CreditGrantManager.tsx and
// IssueReportsManager.tsx so they always render an identical, full
// "วันที่ เวลา" format rather than each rolling its own.
//
// th-TH locale renders the Buddhist calendar year automatically (พ.ศ.),
// which is what a Thai admin expects to see, not ค.ศ.
//
// Accepts string | Date because @neondatabase/serverless returns
// timestamptz columns as native JS Date objects, not ISO strings — despite
// the ComplianceRule type in lib/complianceRules.ts declaring them as
// `string`. `new Date(x)` handles both correctly.
//
// FIX (bug audit round 2 follow-up, found during post-deploy verification):
// this used to call toLocaleString() with no `timeZone`, which resolves to
// whatever local timezone the *running process* happens to be in. The three
// admin components above are all client components, which Next.js
// server-renders once (for the initial HTML) and then hydrates in the
// browser — the exact same `value` gets formatted twice, by two different
// processes, that can be in two different timezones (the Render server
// defaults to UTC; a browser is whatever the visitor's OS is set to). Any
// time those disagree, the server-rendered text and the client's hydration
// output are two different strings, which is a real, reproducible React
// hydration mismatch (minified errors #418/#423/#425 in the browser
// console) — confirmed live on /admin/knowledge-base and /admin/reports
// (both render real rows through this function); /admin/credits merely
// happened to have an empty grant history at the time, so nothing called
// it. Pinning the timezone makes the output deterministic regardless of
// which machine — or which timezone that machine is configured for — runs
// the formatting, which is also simply correct: this is a Thai admin tool
// for a Thailand-based business, so "the time" here should always mean
// Thailand time, not the visitor's or server's local clock.
export function formatThaiDateTime(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleString("th-TH", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
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
