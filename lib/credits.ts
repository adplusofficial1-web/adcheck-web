import { sql } from "@/lib/db";

// One purchased package still within its 30-day cycle, for display on the
// settings page (one row per package — see components/settings/SettingsClient.tsx).
export type ActivePackage = {
  id: string;
  plan_id: string;
  plan_name: string;
  plan_code: string;
  price_thb: string | number;
  credits_granted: number;
  credits_remaining: number;
  purchased_at: string;
  expires_at: string;
};

// Every still-active (unexpired) package purchase for a business, ordered
// soonest-to-expire first — the same order reserveCredits() below spends
// from, so the settings page and the actual deduction logic always agree
// on "which pool is about to lapse".
export async function getActivePackages(businessId: string): Promise<ActivePackage[]> {
  const rows = await sql`
    SELECT bp.id, bp.plan_id, p.name AS plan_name, p.code AS plan_code, p.price_thb,
      bp.credits_granted, bp.credits_remaining, bp.purchased_at, bp.expires_at
    FROM business_packages bp
    JOIN plans p ON p.id = bp.plan_id
    WHERE bp.business_id = ${businessId} AND bp.expires_at > now()
    ORDER BY bp.expires_at ASC
  `;
  return rows as any[];
}

// Atomically checks-and-reserves `amount` credits for a submission (see
// app/api/submissions/route.ts, which now calls this BEFORE creating the
// submission row / doing any AI work, instead of the old pattern of a
// separate un-atomic "is there enough?" read followed, many seconds later
// after all images finished processing, by a separate deduction).
//
// Returns false (and changes nothing) if the business doesn't have enough
// combined credits (active packages + legacy balance) for `amount`. Returns
// true if the deduction was applied.
//
// FIX (bug audit #1 + #2): this replaces the old deductCredits(), which had
// two separate problems:
//   1. Its per-row "new remaining" formula was inverted — it computed how
//      much was TAKEN from a package row and stored that as what's LEFT,
//      so e.g. deducting 5 credits from a fresh 100-credit package left
//      credits_remaining = 5 instead of 95.
//   2. The credit-sufficiency check (app/api/submissions/route.ts) and the
//      actual deduction were two separate, unsynchronized DB round-trips
//      minutes apart (the check ran before AI review started; the old
//      deductCredits() ran only after every image finished) — two
//      concurrent submissions for the same business could both pass the
//      check against the same starting balance and jointly overdraw it.
//
// FIX for both: a single SQL statement that
//   - takes `SELECT ... FOR UPDATE` on the business row first, so
//     concurrent callers for the same business serialize against each
//     other for the lifetime of this one statement (Postgres holds the
//     lock until the statement's implicit transaction commits);
//   - computes the combined available total (active packages + legacy
//     balance) from that same locked point in time;
//   - only performs the package/legacy UPDATEs when the total is enough,
//     using the corrected running-total formula
//     `LEAST(credits_remaining, GREATEST(running_total - from_packages, 0))`
//     for each touched package row.
// Everything lives in one statement (via multiple data-modifying CTEs, all
// referenced from the final SELECT so Postgres actually executes them) —
// this app's DB client (lib/db.ts) uses the Neon HTTP driver, which doesn't
// support interactive multi-round-trip transactions with client-side
// branching, only single statements (or pre-built batches). A single
// CTE-based statement is what makes true atomicity possible without adding
// a second, pool-based DB client just for this.
export async function reserveCredits(businessId: string, amount: number): Promise<boolean> {
  if (amount <= 0) return true;

  const [row] = (await sql`
    WITH biz_lock AS (
      SELECT id, credits_remaining AS legacy
      FROM businesses
      WHERE id = ${businessId}
      FOR UPDATE
    ),
    pkg_avail AS (
      SELECT COALESCE(SUM(credits_remaining), 0)::int AS total
      FROM business_packages
      WHERE business_id = ${businessId} AND expires_at > now() AND credits_remaining > 0
    ),
    budget AS (
      SELECT
        bl.legacy AS legacy,
        pa.total AS pkg_total,
        (bl.legacy + pa.total >= ${amount}) AS ok,
        CASE WHEN (bl.legacy + pa.total >= ${amount})
          THEN LEAST(pa.total, ${amount}) ELSE 0 END AS from_packages,
        CASE WHEN (bl.legacy + pa.total >= ${amount})
          THEN ${amount} - LEAST(pa.total, ${amount}) ELSE 0 END AS from_legacy
      FROM biz_lock bl, pkg_avail pa
    ),
    ranked AS (
      SELECT id, credits_remaining,
        SUM(credits_remaining) OVER (
          ORDER BY expires_at ASC, created_at ASC
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS running_total
      FROM business_packages
      WHERE business_id = ${businessId} AND expires_at > now() AND credits_remaining > 0
    ),
    to_apply AS (
      SELECT r.id, LEAST(r.credits_remaining, GREATEST(r.running_total - budget.from_packages, 0)) AS new_remaining
      FROM ranked r, budget
      WHERE budget.ok AND r.running_total - r.credits_remaining < budget.from_packages
    ),
    pkg_update AS (
      UPDATE business_packages bp
      SET credits_remaining = ta.new_remaining, updated_at = now()
      FROM to_apply ta
      WHERE bp.id = ta.id
      RETURNING bp.id
    ),
    biz_update AS (
      UPDATE businesses b
      SET credits_remaining = b.credits_remaining - budget.from_legacy, updated_at = now()
      FROM budget
      WHERE b.id = ${businessId} AND budget.ok
      RETURNING b.id
    )
    SELECT
      budget.ok AS ok,
      (SELECT count(*) FROM pkg_update) AS pkg_rows,
      (SELECT count(*) FROM biz_update) AS biz_rows
    FROM budget
  `) as any[];

  return Boolean(row?.ok);
}

// Gives back `amount` credits to the business's non-expiring legacy
// balance. Used when a submission reserved credits upfront (reserveCredits
// above) but one or more images never got a genuine AI review — e.g. the
// AI call itself failed and the image only got the synthetic
// "please resubmit" fallback flag (see processOneImage in
// app/api/submissions/route.ts) — so the account isn't charged for a
// review that didn't actually happen.
//
// Always refunds to the legacy bucket rather than trying to restore the
// exact package row(s) reserveCredits() drew from — simpler, and avoids
// needing to track per-image which specific package "paid" for it. A
// single UPDATE like this is already atomic/race-safe on its own: Postgres
// serializes concurrent UPDATEs to the same row via the row's own lock, no
// FOR UPDATE needed here.
export async function refundCredits(businessId: string, amount: number): Promise<void> {
  if (amount <= 0) return;
  await sql`
    UPDATE businesses
    SET credits_remaining = credits_remaining + ${amount}, updated_at = now()
    WHERE id = ${businessId}
  `;
}
