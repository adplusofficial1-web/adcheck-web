import { sql } from "@/lib/db";

// Hunter Referral Commission — see migrations/014_hunter_referral_commissions.sql
// for the full design writeup (why attribution is a referral link, not a
// hunter_leads row). Called immediately after every payment call site
// inserts a `transactions` row with status='สำเร็จ':
// app/api/billing/card/route.ts, app/api/webhooks/omise/route.ts,
// scripts/runAutoBilling.ts, and app/api/checkout/route.ts's currently-
// dormant non-card channels (PAYMENT_GATEWAY_ENABLED === false there today,
// but wired in anyway so enabling one of those channels later doesn't
// silently skip commission).
//
// Rates: 30% on a business's first-ever successful payment, 5% on every
// payment after that, forever (including monthly auto-renewals) — matches
// claude/Sales Lead Distribution - Design.md's sales-side model exactly,
// the only commission % this project has actually settled on. Change these
// two constants if Hunter's rate should ever differ from Sales'.
const FIRST_PAYMENT_RATE = 0.3;
const TRAILING_RATE = 0.05;

// Every date bucket in this file is in Thailand's wall-clock — the admin
// and every Hunter are in Asia/Bangkok, and "เดือนนี้"/"วันนี้" must mean
// the Thai calendar day/month, not UTC's (which is 7 hours behind: a
// commission recorded at 02:00 Bangkok time on the 1st would otherwise
// fall into the previous month/day). Postgres side: `AT TIME ZONE
// 'Asia/Bangkok'` on both now() and created_at before truncating. JS side
// (zero-filling the chart series): use these helpers instead of
// toISOString().slice(0, 10) / getMonth(), which are UTC / server-local.
const BANGKOK_TZ = "Asia/Bangkok";

// "YYYY-MM-DD" of the given instant as seen in Asia/Bangkok.
function bangkokDateKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BANGKOK_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

// { year, month (1-12), day } of the given instant as seen in Asia/Bangkok.
function bangkokParts(d: Date): { year: number; month: number; day: number } {
  const [year, month, day] = bangkokDateKey(d).split("-").map(Number);
  return { year, month, day };
}

// Bug Audit 4 (2569-09-02): every caller of recordHunterCommissionIfApplicable
// sits INSIDE a money path — the Omise charge has already succeeded and the
// `transactions` row is already written when it runs. If this function threw
// there (transient Neon error, a migration not applied on that env, a future
// CHECK/FK violation), the caller would abort BEFORE granting credits /
// advancing credits_reset_at: the customer is charged with nothing to show
// for it, and scripts/runAutoBilling.ts would even re-charge the same
// business on its next run. A missed commission row is recoverable by hand
// (the transaction id is logged below); a customer charged twice is not. So
// the money paths call this wrapper, which never throws.
export async function recordHunterCommissionSafely(
  businessId: string,
  transactionId: string,
  amountThb: number
): Promise<void> {
  try {
    await recordHunterCommissionIfApplicable(businessId, transactionId, amountThb);
  } catch (e) {
    console.error(
      `[hunter-commission] failed to record commission for business ${businessId} / transaction ${transactionId} (amount ${amountThb}) — record manually:`,
      e
    );
  }
}

export async function recordHunterCommissionIfApplicable(
  businessId: string,
  transactionId: string,
  amountThb: number
): Promise<void> {
  const [business] = (await sql`
    SELECT referred_by_hunter_user_id FROM businesses WHERE id = ${businessId}
  `) as { referred_by_hunter_user_id: string | null }[];
  const hunterUserId = business?.referred_by_hunter_user_id;
  if (!hunterUserId) return; // this clinic didn't sign up through a Hunter referral link

  // "Which payment number is this" — count every OTHER prior successful
  // transaction for this business, chronologically. Same rule the Sales
  // design doc uses: a new plan, an upgrade, or an auto-renewal all count
  // the same, since the credit system has no real "upgrade" concept —
  // every payment is an independent business_packages row. Excludes the
  // transaction just inserted (it's already in the table by the time this
  // runs) so it isn't double-counted as its own predecessor.
  //
  // FIX (Bug Audit 4, 2569-09-02): the count, the sequence, and the rate
  // are all computed INSIDE the INSERT (subquery + CASE) instead of in a
  // separate SELECT round-trip first. With the old two-step version, two
  // near-simultaneous successful payments for the same business (e.g. the
  // card route and an Omise webhook for a second charge, or two tabs)
  // could both read count=0 and both record themselves as payment #1 at
  // 30%. A single statement evaluates the subquery against the table as it
  // is at that statement's snapshot, so the second insert sees the first
  // transaction row. commission_thb is rounded to satang (2 dp) in SQL to
  // keep the same Math.round(x * 100) / 100 semantics the JS had.
  //
  // ON CONFLICT (transaction_id) DO NOTHING: transaction_id is UNIQUE, so a
  // second call for the same transaction (e.g. an Omise webhook retry
  // racing the synchronous request that already recorded it) is a no-op.
  await sql`
    INSERT INTO hunter_commissions
      (hunter_user_id, business_id, transaction_id, payment_sequence, commission_rate, commission_thb)
    SELECT
      ${hunterUserId}::uuid,
      ${businessId}::uuid,
      ${transactionId}::uuid,
      seq.payment_sequence,
      seq.rate,
      ROUND((${amountThb}::numeric * seq.rate)::numeric, 2)
    FROM (
      SELECT
        prior.count + 1 AS payment_sequence,
        CASE WHEN prior.count = 0 THEN ${FIRST_PAYMENT_RATE}::numeric ELSE ${TRAILING_RATE}::numeric END AS rate
      FROM (
        SELECT count(*)::int AS count
        FROM transactions
        WHERE business_id = ${businessId} AND status = 'สำเร็จ' AND id <> ${transactionId}
      ) prior
    ) seq
    ON CONFLICT (transaction_id) DO NOTHING
  `;
}

// --- Reading a Hunter's own commissions (GET /api/hunter/commissions) ----

// Bug Audit 4 (2569-09-02): 'void' — a commission the admin cancelled (the
// payment was refunded / the row was a mistake). Stays in the ledger for
// the Hunter's own visibility but is excluded from every money total below.
// See migrations/020_hunter_assignment_approval.sql and voidHunterCommission.
export type HunterCommissionPayoutStatus = "pending" | "paid" | "void";

export type HunterCommissionLedgerRow = {
  id: string;
  clinic_name: string;
  payment_sequence: number;
  commission_rate: string;
  commission_thb: string;
  payout_status: HunterCommissionPayoutStatus;
  created_at: string;
};

export async function getHunterCommissionLedger(hunterUserId: string): Promise<HunterCommissionLedgerRow[]> {
  const rows = await sql`
    SELECT hc.id, b.name AS clinic_name, hc.payment_sequence, hc.commission_rate, hc.commission_thb,
           hc.payout_status, hc.created_at
    FROM hunter_commissions hc
    JOIN businesses b ON b.id = hc.business_id
    WHERE hc.hunter_user_id = ${hunterUserId}
    ORDER BY hc.created_at DESC
  `;
  return rows as HunterCommissionLedgerRow[];
}

export type HunterCommissionStats = {
  referredCount: number;
  totalCommissionThb: number;
  pendingThb: number;
  paidThb: number;
  thisMonthThb: number;
};

export async function getHunterCommissionStats(hunterUserId: string): Promise<HunterCommissionStats> {
  const [referred] = (await sql`
    SELECT count(*)::int AS count FROM businesses WHERE referred_by_hunter_user_id = ${hunterUserId}
  `) as { count: number }[];

  // `payout_status <> 'void'` on every SUM: a voided commission is not money
  // owed, so it must not show up in "รอโอน"/"สะสม"/"เดือนนี้". this_month
  // compares Bangkok wall-clock to Bangkok wall-clock (both sides shifted
  // with AT TIME ZONE) — see BANGKOK_TZ above.
  const [totals] = (await sql`
    SELECT
      COALESCE(SUM(commission_thb) FILTER (WHERE payout_status <> 'void'), 0)::numeric AS total,
      COALESCE(SUM(commission_thb) FILTER (WHERE payout_status = 'pending'), 0)::numeric AS pending,
      COALESCE(SUM(commission_thb) FILTER (WHERE payout_status = 'paid'), 0)::numeric AS paid,
      COALESCE(SUM(commission_thb) FILTER (
        WHERE payout_status <> 'void'
          AND (created_at AT TIME ZONE 'Asia/Bangkok') >= date_trunc('month', now() AT TIME ZONE 'Asia/Bangkok')
      ), 0)::numeric AS this_month
    FROM hunter_commissions
    WHERE hunter_user_id = ${hunterUserId}
  `) as { total: string; pending: string; paid: string; this_month: string }[];

  return {
    referredCount: referred?.count ?? 0,
    totalCommissionThb: Number(totals?.total ?? 0),
    pendingThb: Number(totals?.pending ?? 0),
    paidThb: Number(totals?.paid ?? 0),
    thisMonthThb: Number(totals?.this_month ?? 0),
  };
}

// Daily commission totals for the last N days (default 14), oldest first,
// zero-filled for any day with no commission at all — powers the "รายวัน"
// bar chart on /hunter's ภาพรวม tab. Bucketing done in JS rather than a SQL
// generate_series join, since the row count per Hunter is small and this
// keeps the query itself simple.
//
// Bucket keys are Bangkok calendar dates on BOTH sides (SQL groups by
// `(created_at AT TIME ZONE 'Asia/Bangkok')::date`, cast to text so the
// driver hands back a plain 'YYYY-MM-DD' rather than a Date object; JS
// zero-fills with bangkokDateKey) — see the BANGKOK_TZ note at the top.
// Void rows are excluded like every other aggregate here.
export async function getHunterDailyCommission(
  hunterUserId: string,
  days = 14
): Promise<{ label: string; value: number }[]> {
  const rows = (await sql`
    SELECT
      ((created_at AT TIME ZONE 'Asia/Bangkok')::date)::text AS day,
      SUM(commission_thb)::numeric AS total
    FROM hunter_commissions
    WHERE hunter_user_id = ${hunterUserId}
      AND payout_status <> 'void'
      AND created_at >= now() - make_interval(days => ${days})
    GROUP BY (created_at AT TIME ZONE 'Asia/Bangkok')::date
  `) as { day: string; total: string }[];
  const byDay = new Map(rows.map((r) => [r.day, Number(r.total)]));

  // Walk back day-by-day from "now" in whole 24h steps; each step's
  // Bangkok calendar date is the bucket key. (24h steps are safe here —
  // Thailand has no DST, so a Bangkok calendar day is always 24h.)
  const out: { label: string; value: number }[] = [];
  const nowMs = Date.now();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(nowMs - i * 24 * 60 * 60 * 1000);
    const { month, day } = bangkokParts(d);
    out.push({ label: `${day}/${month}`, value: byDay.get(bangkokDateKey(d)) ?? 0 });
  }
  return out;
}

// Same idea, monthly buckets over the last N months (default 6) — powers
// the "รายเดือน" toggle on the same chart. Same Bangkok-on-both-sides rule
// as the daily series.
export async function getHunterMonthlyCommission(
  hunterUserId: string,
  months = 6
): Promise<{ label: string; value: number }[]> {
  const rows = (await sql`
    SELECT
      to_char(date_trunc('month', created_at AT TIME ZONE 'Asia/Bangkok'), 'YYYY-MM') AS month,
      SUM(commission_thb)::numeric AS total
    FROM hunter_commissions
    WHERE hunter_user_id = ${hunterUserId}
      AND payout_status <> 'void'
      AND (created_at AT TIME ZONE 'Asia/Bangkok')
        >= date_trunc('month', now() AT TIME ZONE 'Asia/Bangkok') - make_interval(months => ${months - 1})
    GROUP BY date_trunc('month', created_at AT TIME ZONE 'Asia/Bangkok')
  `) as { month: string; total: string }[];
  const byMonth = new Map(rows.map((r) => [r.month, Number(r.total)]));

  const THAI_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const out: { label: string; value: number }[] = [];
  // Start from the current Bangkok year/month, then step back with plain
  // integer arithmetic — no Date object needed once we have the parts.
  const { year: nowYear, month: nowMonth } = bangkokParts(new Date());
  for (let i = months - 1; i >= 0; i--) {
    // 0-based month index that may go negative; normalise into year/month.
    const idx = nowMonth - 1 - i;
    const year = nowYear + Math.floor(idx / 12);
    const month0 = ((idx % 12) + 12) % 12;
    const key = `${year}-${String(month0 + 1).padStart(2, "0")}`;
    out.push({ label: THAI_MONTHS[month0], value: byMonth.get(key) ?? 0 });
  }
  return out;
}

// --- Admin-side: overview + payout queue -----------------------------------
// Powers the "Hunter — ภาพรวมและค่าคอมมิชชั่น" section on
// /admin/marketing/hunter (GET /api/admin/hunter-commissions) and the mark-
// paid action (PATCH /api/admin/hunter-commissions/[id]).

export type HunterAdminOverviewRow = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  referred_count: number;
  closed_won_count: number;
  pending_thb: string;
  paid_thb: string;
  last_activity: string | null;
};

// One row per Hunter (active or not — a deactivated Hunter's history still
// matters for payout bookkeeping, see migrations/014_hunter_referral_commissions.sql).
// closed_won_count comes from each Hunter's own private hunter_lead_pipeline
// (see lib/hunterPipeline.ts's countClosedWonByHunter doc comment for why
// that's independent of referred_count/commission — this is a single query
// doing the same join inline for every Hunter at once instead of N+1'ing
// that helper).
export async function listHunterAdminOverview(): Promise<HunterAdminOverviewRow[]> {
  const rows = await sql`
    SELECT
      h.id, h.name, h.email, h.active,
      COALESCE(b.referred_count, 0)::int AS referred_count,
      COALESCE(p.closed_won_count, 0)::int AS closed_won_count,
      COALESCE(c.pending_thb, 0) AS pending_thb,
      COALESCE(c.paid_thb, 0) AS paid_thb,
      GREATEST(p.last_pipeline_update, c.last_commission_at) AS last_activity
    FROM hunter_users h
    LEFT JOIN (
      SELECT referred_by_hunter_user_id AS hunter_user_id, count(*) AS referred_count
      FROM businesses WHERE referred_by_hunter_user_id IS NOT NULL
      GROUP BY referred_by_hunter_user_id
    ) b ON b.hunter_user_id = h.id
    LEFT JOIN (
      SELECT hunter_user_id, count(*) FILTER (WHERE status = 'closed_won') AS closed_won_count,
             max(updated_at) AS last_pipeline_update
      FROM hunter_lead_pipeline
      GROUP BY hunter_user_id
    ) p ON p.hunter_user_id = h.id
    LEFT JOIN (
      SELECT hunter_user_id,
             SUM(commission_thb) FILTER (WHERE payout_status = 'pending') AS pending_thb,
             SUM(commission_thb) FILTER (WHERE payout_status = 'paid') AS paid_thb,
             max(created_at) FILTER (WHERE payout_status <> 'void') AS last_commission_at
      FROM hunter_commissions
      GROUP BY hunter_user_id
    ) c ON c.hunter_user_id = h.id
    ORDER BY h.created_at ASC
  `;
  return rows as HunterAdminOverviewRow[];
}

export type HunterPayoutQueueRow = {
  id: string;
  hunter_name: string;
  clinic_name: string;
  payment_sequence: number;
  commission_rate: string;
  commission_thb: string;
  payout_status: HunterCommissionPayoutStatus;
  created_at: string;
  void_reason: string | null;
  payout_method: "promptpay" | "bank" | null;
  payout_promptpay_id: string | null;
  payout_bank_name: string | null;
  payout_bank_account_no: string | null;
  payout_bank_account_name: string | null;
};

// Every commission row (pending, paid AND void — the admin UI shows all
// three, newest first) with the Hunter's name and their currently-saved
// payout details attached, so the admin never has to cross-reference a
// separate screen before transferring money.
export async function listHunterPayoutQueue(): Promise<HunterPayoutQueueRow[]> {
  const rows = await sql`
    SELECT
      hc.id, h.name AS hunter_name, b.name AS clinic_name, hc.payment_sequence,
      hc.commission_rate, hc.commission_thb, hc.payout_status, hc.created_at, hc.void_reason,
      h.payout_method, h.payout_promptpay_id, h.payout_bank_name, h.payout_bank_account_no, h.payout_bank_account_name
    FROM hunter_commissions hc
    JOIN hunter_users h ON h.id = hc.hunter_user_id
    JOIN businesses b ON b.id = hc.business_id
    ORDER BY hc.created_at DESC
  `;
  return rows as HunterPayoutQueueRow[];
}

export async function markHunterCommissionPaid(id: string) {
  const [row] = await sql`
    UPDATE hunter_commissions SET payout_status = 'paid', paid_at = now()
    WHERE id = ${id} AND payout_status = 'pending'
    RETURNING id
  `;
  return !!row;
}

// Bug Audit 4 (2569-09-02): cancel a commission that must never be paid
// (the clinic's payment was refunded, or the row was recorded by mistake).
// Only from 'pending' — a 'paid' row is money that already left the
// building, and reversing that is a bookkeeping action outside this app,
// not a status flip; a row already void stays void (idempotent). Powers
// PATCH /api/admin/hunter-commissions/[id] { action: "void", reason }.
export async function voidHunterCommission(id: string, reason: string) {
  const [row] = await sql`
    UPDATE hunter_commissions
    SET payout_status = 'void', voided_at = now(), void_reason = ${reason || null}
    WHERE id = ${id} AND payout_status = 'pending'
    RETURNING id
  `;
  return !!row;
}
