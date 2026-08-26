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
// soonest-to-expire first — the same order deductCredits() below spends
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

async function getActivePackageCreditsTotal(businessId: string): Promise<number> {
  const [row] = (await sql`
    SELECT COALESCE(SUM(credits_remaining), 0)::int AS total
    FROM business_packages
    WHERE business_id = ${businessId} AND expires_at > now()
  `) as any[];
  return row?.total ?? 0;
}

// Deducts `amount` credits for a completed submission (see
// app/api/submissions/route.ts). Spends from business_packages first —
// soonest-expiring pool first, via getActivePackageCreditsTotal's same
// ordering — so a package about to lapse gets used before one with more
// runway left, and only falls through to the business's own non-expiring
// legacy balance (businesses.credits_remaining — e.g. the free 15-credit
// signup bonus, or whatever pre-dates this multi-package table) once every
// active package is exhausted.
//
// NOTE on concurrency: this reads the active-package total, then issues
// separate UPDATEs — not one atomic transaction spanning the whole
// deduction. That mirrors the same pre-existing tradeoff the single-column
// deduction this replaces already had (the credit check in
// app/api/submissions/route.ts and this deduction were never in one
// transaction together either). Fine at this account's current volume;
// would need real row locking if concurrent submissions from the same
// business become common.
export async function deductCredits(businessId: string, amount: number): Promise<void> {
  if (amount <= 0) return;

  const packageTotal = await getActivePackageCreditsTotal(businessId);
  const fromPackages = Math.min(amount, packageTotal);
  const fromLegacy = amount - fromPackages;

  if (fromPackages > 0) {
    // Walk the active packages soonest-expiring first, accumulating a
    // running total, and only touch the rows needed to cover
    // `fromPackages` — draining earlier (sooner-to-expire) rows to 0
    // before later ones are reduced at all.
    await sql`
      WITH ranked AS (
        SELECT id, credits_remaining,
          SUM(credits_remaining) OVER (
            ORDER BY expires_at ASC, created_at ASC
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ) AS running_total
        FROM business_packages
        WHERE business_id = ${businessId} AND expires_at > now() AND credits_remaining > 0
      ),
      to_apply AS (
        SELECT id, GREATEST(credits_remaining - GREATEST(running_total - ${fromPackages}, 0), 0) AS new_remaining
        FROM ranked
        WHERE running_total - credits_remaining < ${fromPackages}
      )
      UPDATE business_packages bp
      SET credits_remaining = ta.new_remaining, updated_at = now()
      FROM to_apply ta
      WHERE bp.id = ta.id
    `;
  }

  if (fromLegacy > 0) {
    await sql`
      UPDATE businesses SET credits_remaining = GREATEST(credits_remaining - ${fromLegacy}, 0), updated_at = now()
      WHERE id = ${businessId}
    `;
  }
}
