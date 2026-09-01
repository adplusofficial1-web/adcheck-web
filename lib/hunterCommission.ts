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
  const [{ count }] = (await sql`
    SELECT count(*)::int AS count
    FROM transactions
    WHERE business_id = ${businessId} AND status = 'สำเร็จ' AND id != ${transactionId}
  `) as { count: number }[];
  const paymentSequence = count + 1;
  const rate = paymentSequence === 1 ? FIRST_PAYMENT_RATE : TRAILING_RATE;
  const commissionThb = Math.round(amountThb * rate * 100) / 100;

  // ON CONFLICT (transaction_id) DO NOTHING: transaction_id is UNIQUE, so a
  // second call for the same transaction (e.g. an Omise webhook retry
  // racing the synchronous request that already recorded it) is a no-op.
  await sql`
    INSERT INTO hunter_commissions
      (hunter_user_id, business_id, transaction_id, payment_sequence, commission_rate, commission_thb)
    VALUES
      (${hunterUserId}, ${businessId}, ${transactionId}, ${paymentSequence}, ${rate}, ${commissionThb})
    ON CONFLICT (transaction_id) DO NOTHING
  `;
}

// --- Reading a Hunter's own commissions (GET /api/hunter/commissions) ----

export type HunterCommissionLedgerRow = {
  id: string;
  clinic_name: string;
  payment_sequence: number;
  commission_rate: string;
  commission_thb: string;
  payout_status: "pending" | "paid";
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

  const [totals] = (await sql`
    SELECT
      COALESCE(SUM(commission_thb), 0)::numeric AS total,
      COALESCE(SUM(commission_thb) FILTER (WHERE payout_status = 'pending'), 0)::numeric AS pending,
      COALESCE(SUM(commission_thb) FILTER (WHERE payout_status = 'paid'), 0)::numeric AS paid,
      COALESCE(SUM(commission_thb) FILTER (WHERE created_at >= date_trunc('month', now())), 0)::numeric AS this_month
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
export async function getHunterDailyCommission(
  hunterUserId: string,
  days = 14
): Promise<{ label: string; value: number }[]> {
  const rows = (await sql`
    SELECT date(created_at) AS day, SUM(commission_thb)::numeric AS total
    FROM hunter_commissions
    WHERE hunter_user_id = ${hunterUserId} AND created_at >= now() - make_interval(days => ${days})
    GROUP BY date(created_at)
  `) as { day: string; total: string }[];
  const byDay = new Map(rows.map((r) => [r.day, Number(r.total)]));

  const out: { label: string; value: number }[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push({ label: `${d.getDate()}/${d.getMonth() + 1}`, value: byDay.get(key) ?? 0 });
  }
  return out;
}

// Same idea, monthly buckets over the last N months (default 6) — powers
// the "รายเดือน" toggle on the same chart.
export async function getHunterMonthlyCommission(
  hunterUserId: string,
  months = 6
): Promise<{ label: string; value: number }[]> {
  const rows = (await sql`
    SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month, SUM(commission_thb)::numeric AS total
    FROM hunter_commissions
    WHERE hunter_user_id = ${hunterUserId} AND created_at >= date_trunc('month', now()) - make_interval(months => ${months - 1})
    GROUP BY date_trunc('month', created_at)
  `) as { month: string; total: string }[];
  const byMonth = new Map(rows.map((r) => [r.month, Number(r.total)]));

  const THAI_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const out: { label: string; value: number }[] = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push({ label: THAI_MONTHS[d.getMonth()], value: byMonth.get(key) ?? 0 });
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
             max(created_at) AS last_commission_at
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
  payout_status: "pending" | "paid";
  created_at: string;
  payout_method: "promptpay" | "bank" | null;
  payout_promptpay_id: string | null;
  payout_bank_name: string | null;
  payout_bank_account_no: string | null;
  payout_bank_account_name: string | null;
};

// Every commission row (pending AND paid — the admin UI shows both, newest
// first) with the Hunter's name and their currently-saved payout details
// attached, so the admin never has to cross-reference a separate screen
// before transferring money.
export async function listHunterPayoutQueue(): Promise<HunterPayoutQueueRow[]> {
  const rows = await sql`
    SELECT
      hc.id, h.name AS hunter_name, b.name AS clinic_name, hc.payment_sequence,
      hc.commission_rate, hc.commission_thb, hc.payout_status, hc.created_at,
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
