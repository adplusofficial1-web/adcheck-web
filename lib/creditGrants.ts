import { sql } from "@/lib/db";

export type CreditGrant = {
  id: string;
  business_id: string;
  business_name: string;
  business_email: string;
  amount: number;
  reason: string | null;
  granted_by: string;
  created_at: string;
};

// Every grant an admin has made through Admin > เครดิต, newest first — the
// list rendered under the grant form at app/admin/credits/page.tsx so an
// admin can see the effect of a grant immediately and avoid double-granting
// the same clinic by mistake.
export async function listCreditGrants(limit = 50): Promise<CreditGrant[]> {
  const rows = await sql`
    SELECT g.id, g.business_id, b.name AS business_name, b.contact_email AS business_email,
      g.amount, g.reason, g.granted_by, g.created_at
    FROM credit_grants g
    JOIN businesses b ON b.id = g.business_id
    ORDER BY g.created_at DESC
    LIMIT ${limit}
  `;
  return rows as any[];
}

// Adds `amount` free credits to a clinic's non-expiring legacy balance
// (the same bucket refundCredits() in lib/credits.ts tops up, and the one
// reserveCredits() spends from LAST — after any purchased packages — so a
// granted credit never queue-jumps ahead of something the clinic already
// paid for) and records the grant in credit_grants for the audit trail.
//
// One statement, not two round-trips: a CTE updates the balance and
// inserts the audit row together, so a failure partway through can't leave
// one without the other. Same reasoning as lib/credits.ts:reserveCredits
// about lib/db.ts's Neon HTTP driver only supporting single statements,
// not multi-round-trip client transactions.
export async function grantCredits(
  businessId: string,
  amount: number,
  reason: string | null,
  grantedBy: string
): Promise<CreditGrant> {
  const [row] = (await sql`
    WITH biz_update AS (
      UPDATE businesses
      SET credits_remaining = credits_remaining + ${amount}, updated_at = now()
      WHERE id = ${businessId}
      RETURNING id, name, contact_email
    ),
    grant_insert AS (
      INSERT INTO credit_grants (business_id, amount, reason, granted_by)
      SELECT id, ${amount}, ${reason}, ${grantedBy} FROM biz_update
      RETURNING id, business_id, amount, reason, granted_by, created_at
    )
    SELECT gi.id, gi.business_id, bu.name AS business_name, bu.contact_email AS business_email,
      gi.amount, gi.reason, gi.granted_by, gi.created_at
    FROM grant_insert gi, biz_update bu
  `) as any[];
  return row;
}

// Looks up a business by its login email for the grant form's "which
// clinic" lookup step — same contact_email match lib/db.ts:getBusinessByEmail
// uses elsewhere, but returning just enough for the admin UI to confirm it
// found the right clinic before actually granting anything.
export async function findBusinessByEmail(email: string) {
  const rows = await sql`
    SELECT id, name, type, contact_email, credits_remaining
    FROM businesses
    WHERE contact_email = ${email.trim()}
    LIMIT 1
  `;
  return (rows[0] as any) ?? null;
}
