import { sql } from "@/lib/db";

// Thailand's Buddhist calendar year (Gregorian + 543), computed at call
// time rather than hardcoded.
//
// FIX (bug audit round 3): every call site that built an invoice number
// used to hardcode the year as the literal string "2569" (2026 + 543) —
// correct only through the end of calendar 2026. The moment the year rolls
// to 2027 (Buddhist 2570), every one of those call sites would need
// updating by hand, and it would be easy to miss one. Computed here once,
// shifted by Thailand's fixed UTC+7 offset (no DST) so it reflects
// Thailand's own calendar regardless of which timezone the host process
// happens to run in — same technique used in lib/formatDateTime.ts and
// components/admin/MarketingTracker.tsx for the equivalent date bug.
function buddhistYear(): number {
  const bangkokNow = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return bangkokNow.getUTCFullYear() + 543;
}

// FIX (bug audit round 3, high — confirmed live in production, see
// migrations/007_invoice_number_sequence.sql for the full writeup): every
// call site that generated an invoice_number used to build it as
// `INV-2569-${Math.floor(Math.random() * 9000 + 1000)}` — a 4-digit random
// suffix drawn from only 9000 possible values, inserted into a column with
// a UNIQUE constraint (transactions_invoice_number_key) and no retry-on-
// conflict logic anywhere. By the birthday paradox that's better than even
// odds of a collision by roughly the 80th-100th transaction, and this
// business already runs automated recurring billing on top of organic
// checkout traffic. A collision there means a charge that has ALREADY
// succeeded at Omise (the customer's card was already billed) fails to be
// recorded — in scripts/runAutoBilling.ts specifically, an uncaught
// collision kills the whole cron run mid-loop and skips that business's
// `credits_reset_at` advance, so the next run charges it again.
//
// A Postgres sequence is unique by construction (no retry loop needed
// anywhere this is called) — nextval() can never repeat a value already
// handed out, unlike Math.random().
export async function nextInvoiceNumber(): Promise<string> {
  const [row] = (await sql`SELECT nextval('transactions_invoice_seq') AS n`) as { n: string }[];
  return `INV-${buddhistYear()}-${row.n}`;
}
