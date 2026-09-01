import { sql } from "@/lib/db";

// Data-access layer for the Hunter Freelancer Page whitelist — see
// migrations/012_hunter_users.sql for the schema and the project doc
// "Hunter Freelancer Page - Design.md" for the full writeup. Deliberately
// mirrors lib/salesLeads.ts's sales_users section function-for-function
// (same shape of problem: an admin-managed whitelist of external people
// who get their own small area of the app, gated by Gmail sign-in, with
// no self-signup) rather than inventing a different pattern for what is
// structurally the same feature.

export type HunterUser = {
  id: string;
  email: string;
  name: string;
  active: boolean;
  created_at: string;
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

// Existence check WITHOUT the active=true filter — used only by
// lib/currentBusiness.ts's guard against lazily provisioning a business
// row for a Hunter freelancer's email, same reasoning as
// lib/salesLeads.ts:isSalesUserEmail — even a deactivated freelancer's
// email should never turn into a customer business.
export async function isHunterUserEmail(email: string): Promise<boolean> {
  const [row] = await sql`SELECT 1 FROM hunter_users WHERE email = ${email} LIMIT 1`;
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
