import { sql } from "@/lib/db";

// Data-access layer for the Hunter Freelancer Page whitelist — see
// migrations/012_hunter_users.sql for the schema and the project doc
// "Hunter Freelancer Page - Design.md" for the full writeup. Deliberately
// mirrors lib/salesLeads.ts's sales_users section function-for-function
// (same shape of problem: an admin-managed whitelist of external people
// who get their own small area of the app, gated by Gmail sign-in, with
// no self-signup) rather than inventing a different pattern for what is
// structurally the same feature.

// Hunter Referral Commission (2569-09-01): a Hunter's payout channel —
// see migrations/014_hunter_referral_commissions.sql for the columns
// these back.
export type HunterPayoutMethod = "promptpay" | "bank";

export type HunterUser = {
  id: string;
  email: string;
  name: string;
  active: boolean;
  created_at: string;
  phone: string | null;
  line_id: string | null;
  tax_id: string | null;
  tax_address: string | null;
  payout_method: HunterPayoutMethod | null;
  payout_promptpay_id: string | null;
  payout_bank_name: string | null;
  payout_bank_account_no: string | null;
  payout_bank_account_name: string | null;
  // Hunter profile picture (2569-09-01) — see migrations/015_hunter_avatar.sql.
  // Same "data: URL stored inline" convention as businesses.avatar_url.
  avatar_url: string | null;
};

export async function listHunterUsers(): Promise<HunterUser[]> {
  const rows = await sql`SELECT * FROM hunter_users ORDER BY created_at ASC`;
  return rows as HunterUser[];
}

// Looked up on every /hunter request by lib/currentHunterUser.ts — only
// returns a row when active=true, so a deactivated freelancer is treated
// identically to one who was never whitelisted at all.
export async function getActiveHunterUserByEmail(email: string): Promise<HunterUser | null> {
  const [row] = await sql`
    SELECT * FROM hunter_users WHERE email = ${email} AND active = true LIMIT 1
  `;
  return (row as HunterUser) ?? null;
}

// Existence check WITHOUT the active=true filter — returns the row itself
// (not just a boolean like isHunterUserEmail below) so a caller can also
// read `active`/`name`/etc. Used by the Hunter Self-Serve Auto-Registration
// flow (autoRegisterHunterUser below, and app/hunter/page.tsx) to look up
// whatever row is already there — freshly auto-created, or pre-existing and
// deactivated — after an INSERT ... ON CONFLICT DO NOTHING turns out to be
// a no-op.
export async function getHunterUserByEmail(email: string): Promise<HunterUser | null> {
  const [row] = await sql`
    SELECT * FROM hunter_users WHERE email = ${email} LIMIT 1
  `;
  return (row as HunterUser) ?? null;
}

// Hunter Self-Serve Auto-Registration (2569-09-01): lets anyone who signs in
// with Google at /hunter get instant access on their very first sign-in —
// no admin approval step at all. This was a deliberate, explicit decision
// by the site owner, made AFTER being told what it means: anyone with a
// Google account can reach clinic lead data and the commission/payout tabs
// under /hunter the moment they sign in. See the project doc "Hunter
// Self-Serve Signup Request.md" for the full tradeoff writeup — do NOT
// "fix" this back to a gated/pending-approval flow without re-reading that
// context and re-confirming with the site owner first (an earlier version
// of this function, requestHunterAccess, did exactly that gated flow and
// was deliberately replaced by this one).
//
// Inserts with active=true on a brand-new email — but ON CONFLICT (email)
// DO NOTHING is still deliberate and load-bearing: it only sets
// active=true on the row's very FIRST insert. If a row already exists —
// most likely because an admin later deactivated this person — signing
// out and back in must NOT flip active back to true, or admin
// deactivation would be meaningless (a banned Hunter could just re-auth to
// reinstate themselves). app/hunter/page.tsx tells "freshly auto-created"
// (active=true, authorize immediately) apart from "pre-existing and still
// inactive" (show access-denied) by checking the `active` flag on the row
// this function returns. When the INSERT is a no-op (row already
// existed), fall back to getHunterUserByEmail to still return that
// existing row — active or not — to the caller.
export async function autoRegisterHunterUser(email: string, name?: string | null): Promise<HunterUser> {
  const safeName = name?.trim() || email;
  const [row] = await sql`
    INSERT INTO hunter_users (email, name, active)
    VALUES (${email}, ${safeName}, true)
    ON CONFLICT (email) DO NOTHING
    RETURNING *
  `;
  if (row) return row as HunterUser;

  const existing = await getHunterUserByEmail(email);
  if (!existing) {
    // Should be unreachable — ON CONFLICT firing means a row with this
    // email already exists — but throw rather than fabricate a fake row
    // if the table state is ever surprising.
    throw new Error(`autoRegisterHunterUser: insert conflicted but no existing row found for ${email}`);
  }
  return existing;
}

// Existence check WITHOUT the active=true filter — used only by
// lib/currentBusiness.ts's guard against lazily provisioning a business
// row for a Hunter freelancer's email, same reasoning as
// lib/salesLeads.ts:isSalesUserEmail — even a deactivated freelancer's
// email should never turn into a customer business.
export async function isHunterUserEmail(email: string): Promise<boolean> {
  const [row] = await sql`SELECT 1 FROM hunter_users WHERE email = ${email} LIMIT 1`;
  return !!row;
}

// Hunter Referral Commission (2569-09-01): validates the `ref` cookie
// (see middleware.ts) at the moment a new business row is about to be
// created — see lib/currentBusiness.ts:getCurrentBusiness(). Requires
// active=true deliberately: a deactivated Hunter shouldn't pick up brand
// NEW referrals going forward, even though their past referrals keep
// generating commission on history (see migrations/014's comment on
// referred_by_hunter_user_id for that distinction).
export async function isActiveHunterUserId(id: string): Promise<boolean> {
  const [row] = await sql`SELECT 1 FROM hunter_users WHERE id = ${id} AND active = true LIMIT 1`;
  return !!row;
}

// Adding a Hunter freelancer from the admin management form. ON CONFLICT
// reactivates + renames rather than erroring — same as
// lib/salesLeads.ts:createSalesUser, so re-adding a previously-deactivated
// email "just works".
export async function createHunterUser(email: string, name: string): Promise<HunterUser> {
  const [row] = await sql`
    INSERT INTO hunter_users (email, name, active)
    VALUES (${email.trim().toLowerCase()}, ${name.trim()}, true)
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, active = true
    RETURNING *
  `;
  return row as HunterUser;
}

// Toggling active on/off — deactivating just blocks future /hunter access
// (getCurrentHunterUser returns null), nothing else to clean up since a
// Hunter freelancer's page is read-only (no owned records of theirs to
// reassign, unlike a sales rep's lead assignments).
export async function setHunterUserActive(id: string, active: boolean): Promise<HunterUser | null> {
  const [row] = await sql`
    UPDATE hunter_users SET active = ${active} WHERE id = ${id} RETURNING *
  `;
  return (row as HunterUser) ?? null;
}

// --- Hunter's own settings (GET/PATCH /api/hunter/settings) ---------------
// Powers /hunter's "ตั้งค่า" tab (components/hunter/HunterSettingsTab.tsx)
// and the payout half of the "ค่าคอมมิชชั่น & การรับเงิน" tab
// (components/hunter/HunterCommissionTab.tsx) — both PATCH the same
// endpoint, which calls whichever of these two a given request's fields
// call for. Every param is optional and COALESCEd against the existing
// column: `undefined` (the field genuinely wasn't in this request) leaves
// it untouched, while an explicit "" DOES overwrite (a Hunter clearing a
// field is a real edit, not "not provided") — same convention as
// lib/hunterPipeline.ts's own partial-update upsert.

export async function updateHunterProfile(
  id: string,
  fields: {
    name?: string;
    phone?: string;
    lineId?: string;
    taxId?: string;
    taxAddress?: string;
    avatarUrl?: string;
  }
): Promise<HunterUser | null> {
  const [row] = await sql`
    UPDATE hunter_users SET
      name = COALESCE(${fields.name ?? null}, name),
      phone = COALESCE(${fields.phone ?? null}, phone),
      line_id = COALESCE(${fields.lineId ?? null}, line_id),
      tax_id = COALESCE(${fields.taxId ?? null}, tax_id),
      tax_address = COALESCE(${fields.taxAddress ?? null}, tax_address),
      avatar_url = COALESCE(${fields.avatarUrl ?? null}, avatar_url)
    WHERE id = ${id}
    RETURNING *
  `;
  return (row as HunterUser) ?? null;
}

export async function updateHunterPayout(
  id: string,
  fields: {
    method: HunterPayoutMethod;
    promptpayId?: string;
    bankName?: string;
    bankAccountNo?: string;
    bankAccountName?: string;
  }
): Promise<HunterUser | null> {
  const [row] = await sql`
    UPDATE hunter_users SET
      payout_method = ${fields.method},
      payout_promptpay_id = COALESCE(${fields.promptpayId ?? null}, payout_promptpay_id),
      payout_bank_name = COALESCE(${fields.bankName ?? null}, payout_bank_name),
      payout_bank_account_no = COALESCE(${fields.bankAccountNo ?? null}, payout_bank_account_no),
      payout_bank_account_name = COALESCE(${fields.bankAccountName ?? null}, payout_bank_account_name)
    WHERE id = ${id}
    RETURNING *
  `;
  return (row as HunterUser) ?? null;
}
