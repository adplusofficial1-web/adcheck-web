import { sql } from "@/lib/db";

// Every clinic an "Agency" account manages lives in the same `businesses`
// table as a stand-alone clinic, linked back via `parent_agency_id`
// (self-referencing FK — already part of the schema, unused until this
// feature). There's no separate agency signup: any signed-in business can
// add clinics under itself and the คลินิก/Agency toggle in Nav just shows
// or hides that view — see components/Nav.tsx.

export type ChildClinic = {
  id: string;
  name: string;
  type: string;
  contact_email: string | null;
  phone: string | null;
  license_number: string | null;
  address: string | null;
  credits_remaining: number;
  credits_reset_at: string | null;
  plan_id: string | null;
  plan_name: string | null;
  plan_code: string | null;
  price_thb: string | number | null;
  monthly_image_credits: number | null;
};

export async function getChildClinics(agencyId: string): Promise<ChildClinic[]> {
  const rows = await sql`
    SELECT b.id, b.name, b.type, b.contact_email, b.phone, b.license_number, b.address,
      b.credits_remaining, b.credits_reset_at, b.plan_id,
      p.name AS plan_name, p.code AS plan_code, p.price_thb, p.monthly_image_credits
    FROM businesses b
    LEFT JOIN plans p ON p.id = b.plan_id
    WHERE b.parent_agency_id = ${agencyId}
    ORDER BY b.created_at ASC
  `;
  return rows as any[];
}

// Adds a clinic under this agency's network. It has no Google login of its
// own — the agency manages it directly (uploads, billing, info) from its
// own signed-in session, scoped by parent_agency_id everywhere a child
// clinic's data is read or written. contact_email is left NULL rather than
// a placeholder string when not given: the column has a UNIQUE constraint,
// and Postgres treats multiple NULLs as distinct, so this never collides
// with a real Google-login business row.
export async function addChildClinic(agencyId: string, name: string, email?: string | null) {
  const rows = await sql`
    INSERT INTO businesses (name, type, contact_email, parent_agency_id)
    VALUES (${name}, 'clinic', ${email?.trim() || null}, ${agencyId})
    RETURNING id, name, type, contact_email, parent_agency_id, credits_remaining
  `;
  return rows[0] as any;
}

// Every business id a signed-in session is allowed to act on: itself, plus
// any clinic it manages as an agency. Every ownership check that used to
// compare against a single business.id (results, processing, submission
// status polling) widens to this list now that Agency mode lets one
// session act for several businesses — a plain `= business.id` check would
// otherwise 404/401 an agency trying to view a clinic it legitimately
// manages.
export async function getAccessibleBusinessIds(agencyId: string): Promise<string[]> {
  const rows = await sql`SELECT id FROM businesses WHERE parent_agency_id = ${agencyId}`;
  return [agencyId, ...rows.map((r: any) => r.id as string)];
}

// Resolves a specific business by id, but only if the signed-in business is
// allowed to act on it: itself, or a clinic it manages. Used wherever a
// request names a target business explicitly (checkout, upload) instead of
// always defaulting to the signed-in business — returns null rather than
// throwing so callers can respond 403/404 without leaking whether the id
// exists at all.
export async function getBusinessByIdForOwner(id: string, ownerBusinessId: string) {
  const rows = await sql`
    SELECT b.*, p.name AS plan_name, p.code AS plan_code, p.price_thb, p.monthly_image_credits
    FROM businesses b
    LEFT JOIN plans p ON p.id = b.plan_id
    WHERE b.id = ${id} AND (b.id = ${ownerBusinessId} OR b.parent_agency_id = ${ownerBusinessId})
    LIMIT 1
  `;
  return (rows[0] as any) ?? null;
}

// Aggregate + per-clinic monthly review stats in one round trip (avoids
// N+1 — one query no matter how many clinics the agency manages).
export async function getClinicMonthlyStats(businessIds: string[]) {
  const stats = new Map<string, { passed: number; caution: number; violation: number }>();
  for (const id of businessIds) stats.set(id, { passed: 0, caution: 0, violation: 0 });
  if (businessIds.length === 0) return stats;

  const rows = (await sql`
    SELECT s.business_id, si.status, count(*)::int AS n
    FROM submission_images si
    JOIN submissions s ON s.id = si.submission_id
    WHERE s.business_id = ANY(${businessIds}::uuid[])
      AND s.created_at >= date_trunc('month', now())
    GROUP BY s.business_id, si.status
  `) as any[];
  for (const r of rows) {
    const s = stats.get(r.business_id);
    if (s && (r.status === "passed" || r.status === "caution" || r.status === "violation")) {
      s[r.status as "passed" | "caution" | "violation"] = r.n;
    }
  }
  return stats;
}

// Most recent reviewed images per clinic (agency dashboard cards + the
// "all clinics" grouped history view) — one query total via a window
// function instead of one query per clinic. Pass a status to filter (same
// values as submission_images.status: passed/caution/violation).
export async function getRecentImagesByBusiness(
  businessIds: string[],
  perClinic = 5,
  status?: string
) {
  const byBusiness = new Map<string, any[]>();
  for (const id of businessIds) byBusiness.set(id, []);
  if (businessIds.length === 0) return byBusiness;

  const rows = (status
    ? await sql`
        SELECT * FROM (
          SELECT si.id, si.filename, si.status, s.id AS submission_id, s.business_id, s.created_at,
            ROW_NUMBER() OVER (PARTITION BY s.business_id ORDER BY s.created_at DESC) AS rn
          FROM submission_images si
          JOIN submissions s ON s.id = si.submission_id
          WHERE s.business_id = ANY(${businessIds}::uuid[]) AND si.status = ${status}
        ) ranked
        WHERE rn <= ${perClinic}
        ORDER BY business_id, created_at DESC
      `
    : await sql`
        SELECT * FROM (
          SELECT si.id, si.filename, si.status, s.id AS submission_id, s.business_id, s.created_at,
            ROW_NUMBER() OVER (PARTITION BY s.business_id ORDER BY s.created_at DESC) AS rn
          FROM submission_images si
          JOIN submissions s ON s.id = si.submission_id
          WHERE s.business_id = ANY(${businessIds}::uuid[])
        ) ranked
        WHERE rn <= ${perClinic}
        ORDER BY business_id, created_at DESC
      `) as any[];

  for (const r of rows) byBusiness.get(r.business_id)?.push(r);
  return byBusiness;
}

export type PlanCycleStatus = {
  // Whether the account is currently inside a paid 30-day cycle at all
  // (any plan, not just the Agency one) — see daysRemaining below.
  withinCycle: boolean;
  isAgencyPlan: boolean;
  // Days left until credits_reset_at, ceil()'d so "today" still reads as
  // at least 1. 0 or negative means the cycle has lapsed. null means the
  // account has never completed a purchase (credits_reset_at was never
  // set — see the DEFAULT-only row created at signup in
  // lib/db.ts:createBusinessForEmail).
  daysRemaining: number | null;
};

export function getPlanCycleStatus(business: {
  plan_code?: string | null;
  credits_reset_at?: string | Date | null;
}): PlanCycleStatus {
  const isAgencyPlan = business.plan_code === "agency";
  let daysRemaining: number | null = null;
  if (business.credits_reset_at) {
    const ms = new Date(business.credits_reset_at).getTime() - Date.now();
    daysRemaining = Math.ceil(ms / (1000 * 60 * 60 * 24));
  }
  const withinCycle = daysRemaining !== null && daysRemaining > 0;
  return { withinCycle, isAgencyPlan, daysRemaining };
}

// Whether this account's OWN plan unlocks uploading on behalf of the
// clinics it manages in Agency mode — gates the per-clinic "+ อัปโหลด"
// buttons on /agency/dashboard and the ?business= path in
// app/upload/page.tsx + app/api/submissions/route.ts. Requires the
// *signed-in* account itself (never a child clinic — see the callers,
// which always pass the signed-in `business`, not `target`) to be on the
// code='agency' plan (the "หลายสาขา / Agency" row in `plans`, bought like
// any other package via /checkout?plan=agency) with a 30-day cycle that
// hasn't lapsed yet.
//
// A child clinic's own separate package (bought via
// /checkout?business=<clinic id>, see components/agency/ClinicSettingsCard)
// is a different, unrelated billing track — it still governs that clinic's
// own credits_remaining regardless of whether the agency itself is on an
// active Agency plan. Both have to hold for an upload to actually go
// through: the agency plan unlocks the *button*, the clinic's own credits
// pay for the *review* (see app/api/submissions/route.ts's separate
// `credits_remaining < images.length` check).
export function hasActiveAgencyPlan(business: {
  plan_code?: string | null;
  credits_reset_at?: string | Date | null;
}): boolean {
  const status = getPlanCycleStatus(business);
  return status.isAgencyPlan && status.withinCycle;
}
