import { sql } from "@/lib/db";
import { isValidUuid } from "@/lib/validation";

// Data-access layer for the Sales Lead Distribution feature — see
// claude/Sales Lead Distribution - Design.md (project docs) for the full
// writeup and migrations/011_sales_leads.sql for the schema this reads and
// writes. Mirrors the style of lib/hunterLeads.ts: small, obviously-named
// functions per operation rather than one generic CRUD layer, grouped here
// by who calls them.

export const DAILY_QUOTA = 10;

export type SalesStatus = "new" | "contacted" | "interested" | "closed_won" | "closed_lost" | "no_response";

const ALLOWED_SALES_STATUS: SalesStatus[] = [
  "new",
  "contacted",
  "interested",
  "closed_won",
  "closed_lost",
  "no_response",
];

export function isSalesStatus(v: unknown): v is SalesStatus {
  return typeof v === "string" && (ALLOWED_SALES_STATUS as string[]).includes(v);
}

export type SalesUser = {
  id: string;
  email: string;
  name: string;
  active: boolean;
  created_at: string;
};

// A lead assignment joined with the hunter_leads row it points at — the
// shape both the /sales page and the admin overview want (they just show
// different subsets of these fields).
export type SalesLeadAssignment = {
  id: string;
  hunter_lead_id: string;
  sales_user_id: string;
  sales_status: SalesStatus;
  notes: string | null;
  assigned_at: string;
  status_updated_at: string | null;
  clinic_name: string;
  province: string | null;
  source_link: string | null;
  result_url: string | null;
  review_status: string | null;
  flag_count: number | null;
};

// --- Sales users (admin-managed whitelist) -------------------------------

export async function listSalesUsers(): Promise<SalesUser[]> {
  const rows = await sql`SELECT * FROM sales_users ORDER BY created_at ASC`;
  return rows as SalesUser[];
}

// Looked up on every /sales request by lib/currentSalesUser.ts — only
// returns a row when active=true, so a deactivated rep is treated
// identically to one who was never whitelisted at all (see
// getCurrentSalesUser's own comment for why that matters).
export async function getActiveSalesUserByEmail(email: string): Promise<SalesUser | null> {
  const [row] = await sql`
    SELECT * FROM sales_users WHERE email = ${email} AND active = true LIMIT 1
  `;
  return (row as SalesUser) ?? null;
}

// Existence check WITHOUT the active=true filter — used only by
// lib/currentBusiness.ts's guard against lazily provisioning a business
// row for a sales rep's email. Deliberately ignores active/inactive here:
// even a deactivated sales rep's email should never turn into a customer
// business just because they signed in somewhere on the clinic-facing
// side — the sales_users row itself is what disqualifies the email, not
// whether it's currently enabled.
export async function isSalesUserEmail(email: string): Promise<boolean> {
  const [row] = await sql`SELECT 1 FROM sales_users WHERE email = ${email} LIMIT 1`;
  return !!row;
}

// Validates a referral link's sales_user_id (/login?ref=<id>, see
// app/login/page.tsx's "sales_ref" cookie and lib/currentBusiness.ts, which
// is the only caller) before it's ever permanently attributed to a new
// business row for Sales Commission purposes — see
// claude/Sales Lead Distribution - Design.md ("ค่าคอมมิชชั่นเซลล์") and
// migrations/012_sales_commissions.sql. Same active=true requirement as
// getActiveSalesUserByEmail: a deactivated rep's old referral links should
// stop attributing brand-new signups (businesses already attributed to them
// keep that attribution forever regardless — see lib/db.ts:createBusinessForEmail).
// Guards the uuid shape itself rather than letting a malformed/forged cookie
// value reach Postgres as a raw type error.
export async function getActiveSalesUserById(id: string): Promise<SalesUser | null> {
  if (!isValidUuid(id)) return null;
  const [row] = await sql`SELECT * FROM sales_users WHERE id = ${id} AND active = true LIMIT 1`;
  return (row as SalesUser) ?? null;
}

// Adding a sales rep from the Hunter page's "เพิ่มเซลล์" form
// (components/admin/SalesOverview.tsx). ON CONFLICT reactivates + renames
// rather than erroring, so re-adding an email that was previously
// deactivated (rather than never existing) "just works" without the admin
// needing to know the difference — same spirit as
// lib/db.ts:createBusinessForEmail's ON CONFLICT DO NOTHING, except here we
// DO want the retry to actually update the row (a deactivated rep coming
// back is the expected way to re-enable them).
export async function createSalesUser(email: string, name: string): Promise<SalesUser> {
  const [row] = await sql`
    INSERT INTO sales_users (email, name, active)
    VALUES (${email.trim().toLowerCase()}, ${name.trim()}, true)
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, active = true
    RETURNING *
  `;
  return row as SalesUser;
}

// Toggling active on/off (the per-row enable/disable control on the Hunter
// page). Deactivating does NOT touch that rep's existing assignments —
// they keep whatever leads they already have and can presumably still be
// re-activated later — it only removes them from
// scripts/salesLeadDistributionJob.ts's "active sales reps" loop, so they
// stop receiving new leads.
export async function setSalesUserActive(id: string, active: boolean): Promise<SalesUser | null> {
  const [row] = await sql`
    UPDATE sales_users SET active = ${active} WHERE id = ${id} RETURNING *
  `;
  return (row as SalesUser) ?? null;
}

// --- Sales rep's own view (/sales, /api/sales/leads) ---------------------

// Open leads (new/contacted/interested) first, then closed ones, newest
// assignment first within each group — matches the design doc's "เปิดอยู่
// ก่อน แล้วตามด้วยที่ปิดแล้ว" ordering.
export async function getSalesLeadsForUser(salesUserId: string): Promise<SalesLeadAssignment[]> {
  const rows = await sql`
    SELECT
      a.id, a.hunter_lead_id, a.sales_user_id, a.sales_status, a.notes,
      a.assigned_at, a.status_updated_at,
      h.clinic_name, h.province, h.source_link, h.result_url, h.review_status, h.flag_count
    FROM sales_lead_assignments a
    JOIN hunter_leads h ON h.id = a.hunter_lead_id
    WHERE a.sales_user_id = ${salesUserId}
    ORDER BY
      CASE WHEN a.sales_status IN ('new', 'contacted', 'interested') THEN 0 ELSE 1 END,
      a.assigned_at DESC
  `;
  return rows as SalesLeadAssignment[];
}

// Updates one assignment's sales_status/notes — called from
// PATCH /api/sales/leads/[id]. The `AND sales_user_id = ${salesUserId}`
// clause is the ownership check: a sales rep can only ever touch their own
// assignments, enforced at the query level rather than a separate
// SELECT-then-check, so there's no window for one rep to edit another's
// lead. Returns null if the row doesn't exist OR belongs to someone else —
// the route treats both the same (404), which also avoids leaking whether
// a given lead id exists at all to a rep who doesn't own it.
export async function updateSalesLeadAssignment(
  id: string,
  salesUserId: string,
  updates: { salesStatus?: SalesStatus; notes?: string | null }
): Promise<SalesLeadAssignment | null> {
  const [row] = await sql`
    UPDATE sales_lead_assignments a
    SET
      sales_status = COALESCE(${updates.salesStatus ?? null}, a.sales_status),
      notes = CASE WHEN ${updates.notes !== undefined} THEN ${updates.notes ?? null} ELSE a.notes END,
      status_updated_at = CASE WHEN ${updates.salesStatus !== undefined} THEN now() ELSE a.status_updated_at END
    WHERE a.id = ${id} AND a.sales_user_id = ${salesUserId}
    RETURNING a.*
  `;
  if (!row) return null;

  const [joined] = await sql`
    SELECT
      a.id, a.hunter_lead_id, a.sales_user_id, a.sales_status, a.notes,
      a.assigned_at, a.status_updated_at,
      h.clinic_name, h.province, h.source_link, h.result_url, h.review_status, h.flag_count
    FROM sales_lead_assignments a
    JOIN hunter_leads h ON h.id = a.hunter_lead_id
    WHERE a.id = ${id}
  `;
  return (joined as SalesLeadAssignment) ?? null;
}

// --- Admin monitor (Hunter page's "เซลล์ & การกระจาย Lead" section) -------

export type SalesOverviewRow = {
  id: string;
  email: string;
  name: string;
  active: boolean;
  open_count: number; // leads currently new/contacted/interested — "ใช้ไปกี่/10"
  closed_won_count: number;
  last_activity_at: string | null;
};

// One row per sales user with their queue occupancy — powers the overview
// table. LEFT JOINs so a brand-new rep with zero assignments still shows a
// row (0/10), not missing entirely. Aggregated in SQL rather than N+1
// queries per rep since this is polled every 10-15s from the Hunter page.
export async function getSalesOverview(): Promise<SalesOverviewRow[]> {
  const rows = await sql`
    SELECT
      u.id, u.email, u.name, u.active,
      COUNT(*) FILTER (WHERE a.sales_status IN ('new', 'contacted', 'interested'))::int AS open_count,
      COUNT(*) FILTER (WHERE a.sales_status = 'closed_won')::int AS closed_won_count,
      MAX(a.status_updated_at) AS last_activity_at
    FROM sales_users u
    LEFT JOIN sales_lead_assignments a ON a.sales_user_id = u.id
    GROUP BY u.id
    ORDER BY u.created_at ASC
  `;
  return rows as SalesOverviewRow[];
}

export type SalesActivityEvent = {
  assignment_id: string;
  sales_status: SalesStatus;
  status_updated_at: string;
  clinic_name: string;
  sales_user_name: string;
};

// Recent status changes across every rep, newest first — the "เซลล์ A
// เปลี่ยน Vincent Clinic → ติดต่อแล้ว เมื่อ 2 นาทีที่แล้ว" feed. Only rows
// where status_updated_at is set (i.e. actually touched at least once —
// see migrations/011_sales_leads.sql's comment on that column), so a
// freshly-assigned-but-untouched lead never shows up as "activity".
export async function getRecentSalesActivity(limit = 20): Promise<SalesActivityEvent[]> {
  const rows = await sql`
    SELECT a.id AS assignment_id, a.sales_status, a.status_updated_at, h.clinic_name, u.name AS sales_user_name
    FROM sales_lead_assignments a
    JOIN hunter_leads h ON h.id = a.hunter_lead_id
    JOIN sales_users u ON u.id = a.sales_user_id
    WHERE a.status_updated_at IS NOT NULL
    ORDER BY a.status_updated_at DESC
    LIMIT ${limit}
  `;
  return rows as SalesActivityEvent[];
}

// --- Daily distribution (scripts/salesLeadDistributionJob.ts) ------------

export type DistributionResult = {
  salesUserId: string;
  salesUserName: string;
  assignedCount: number;
  needed: number;
};

// The core "top up every active rep to DAILY_QUOTA open leads" algorithm —
// see the design doc for the full writeup. Deliberately sequential (one
// rep at a time, in signup order — "ความเป็นธรรม" note in the design doc)
// rather than one batched query across every rep at once: each rep's
// INSERT commits before the next rep's pool SELECT runs, and the pool
// query's anti-join (no matching sales_lead_assignments row yet) is what
// keeps two reps from ever being handed the same lead, without needing any
// explicit locking — this only ever runs from one cron process at a time.
export async function distributeDailyLeads(): Promise<DistributionResult[]> {
  const activeReps = (await sql`
    SELECT id, name FROM sales_users WHERE active = true ORDER BY created_at ASC
  `) as { id: string; name: string }[];

  const results: DistributionResult[] = [];

  for (const rep of activeReps) {
    const [{ open_count }] = (await sql`
      SELECT COUNT(*)::int AS open_count
      FROM sales_lead_assignments
      WHERE sales_user_id = ${rep.id} AND sales_status IN ('new', 'contacted', 'interested')
    `) as { open_count: number }[];

    const needed = DAILY_QUOTA - open_count;
    if (needed <= 0) {
      results.push({ salesUserId: rep.id, salesUserName: rep.name, assignedCount: 0, needed: 0 });
      continue;
    }

    // Pool: completed leads with a real compliance problem, never assigned
    // to anyone yet, oldest first. review_status IS NOT NULL implicitly
    // excludes any lead completed before migrations/011_sales_leads.sql
    // (backfilled as NULL, not a value the CHECK constraint would accept
    // for "unknown") — see that migration's comment.
    const pool = (await sql`
      SELECT h.id
      FROM hunter_leads h
      WHERE h.status = 'done'
        AND h.review_status IN ('caution', 'violation')
        AND NOT EXISTS (SELECT 1 FROM sales_lead_assignments a WHERE a.hunter_lead_id = h.id)
      ORDER BY h.updated_at ASC
      LIMIT ${needed}
    `) as { id: string }[];

    for (const { id: hunterLeadId } of pool) {
      await sql`
        INSERT INTO sales_lead_assignments (hunter_lead_id, sales_user_id)
        VALUES (${hunterLeadId}, ${rep.id})
        ON CONFLICT (hunter_lead_id) DO NOTHING
      `;
    }

    results.push({ salesUserId: rep.id, salesUserName: rep.name, assignedCount: pool.length, needed });
  }

  return results;
}


// Data-access layer for the Sales Lead Distribution feature — see
// claude/Sales Lead Distribution - Design.md (project docs) for the full
// writeup and migrations/011_sales_leads.sql for the schema this reads and
// writes. Mirrors the style of lib/hunterLeads.ts: small, obviously-named
// functions per operation rather than one generic CRUD layer, grouped here
// by who calls them.

export const DAILY_QUOTA = 10;

export type SalesStatus = "new" | "contacted" | "interested" | "closed_won" | "closed_lost" | "no_response";

const ALLOWED_SALES_STATUS: SalesStatus[] = [
  "new",
  "contacted",
  "interested",
  "closed_won",
  "closed_lost",
  "no_response",
];

export function isSalesStatus(v: unknown): v is SalesStatus {
  return typeof v === "string" && (ALLOWED_SALES_STATUS as string[]).includes(v);
}

export type SalesUser = {
  id: string;
  email: string;
  name: string;
  active: boolean;
  created_at: string;
};

// A lead assignment joined with the hunter_leads row it points at — the
// shape both the /sales page and the admin overview want (they just show
// different subsets of these fields).
export type SalesLeadAssignment = {
  id: string;
  hunter_lead_id: string;
  sales_user_id: string;
  sales_status: SalesStatus;
  notes: string | null;
  assigned_at: string;
  status_updated_at: string | null;
  clinic_name: string;
  province: string | null;
  source_link: string | null;
  result_url: string | null;
  review_status: string | null;
  flag_count: number | null;
};

// --- Sales users (admin-managed whitelist) -------------------------------

export async function listSalesUsers(): Promise<SalesUser[]> {
  const rows = await sql`SELECT * FROM sales_users ORDER BY created_at ASC`;
  return rows as SalesUser[];
}

// Looked up on every /sales request by lib/currentSalesUser.ts — only
// returns a row when active=true, so a deactivated rep is treated
// identically to one who was never whitelisted at all (see
// getCurrentSalesUser's own comment for why that matters).
export async function getActiveSalesUserByEmail(email: string): Promise<SalesUser | null> {
  const [row] = await sql`
    SELECT * FROM sales_users WHERE email = ${email} AND active = true LIMIT 1
  `;
  return (row as SalesUser) ?? null;
}

// Existence check WITHOUT the active=true filter — used only by
// lib/currentBusiness.ts's guard against lazily provisioning a business
// row for a sales rep's email. Deliberately ignores active/inactive here:
// even a deactivated sales rep's email should never turn into a customer
// business just because they signed in somewhere on the clinic-facing
// side — the sales_users row itself is what disqualifies the email, not
// whether it's currently enabled.
export async function isSalesUserEmail(email: string): Promise<boolean> {
  const [row] = await sql`SELECT 1 FROM sales_users WHERE email = ${email} LIMIT 1`;
  return !!row;
}

// Adding a sales rep from the Hunter page's "เพิ่มเซลล์" form
// (components/admin/SalesOverview.tsx). ON CONFLICT reactivates + renames
// rather than erroring, so re-adding an email that was previously
// deactivated (rather than never existing) "just works" without the admin
// needing to know the difference — same spirit as
// lib/db.ts:createBusinessForEmail's ON CONFLICT DO NOTHING, except here we
// DO want the retry to actually update the row (a deactivated rep coming
// back is the expected way to re-enable them).
export async function createSalesUser(email: string, name: string): Promise<SalesUser> {
  const [row] = await sql`
    INSERT INTO sales_users (email, name, active)
    VALUES (${email.trim().toLowerCase()}, ${name.trim()}, true)
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, active = true
    RETURNING *
  `;
  return row as SalesUser;
}

// Toggling active on/off (the per-row enable/disable control on the Hunter
// page). Deactivating does NOT touch that rep's existing assignments —
// they keep whatever leads they already have and can presumably still be
// re-activated later — it only removes them from
// scripts/salesLeadDistributionJob.ts's "active sales reps" loop, so they
// stop receiving new leads.
export async function setSalesUserActive(id: string, active: boolean): Promise<SalesUser | null> {
  const [row] = await sql`
    UPDATE sales_users SET active = ${active} WHERE id = ${id} RETURNING *
  `;
  return (row as SalesUser) ?? null;
}

// --- Sales rep's own view (/sales, /api/sales/leads) ---------------------

// Open leads (new/contacted/interested) first, then closed ones, newest
// assignment first within each group — matches the design doc's "เปิดอยู่
// ก่อน แล้วตามด้วยที่ปิดแล้ว" ordering.
export async function getSalesLeadsForUser(salesUserId: string): Promise<SalesLeadAssignment[]> {
  const rows = await sql`
    SELECT
      a.id, a.hunter_lead_id, a.sales_user_id, a.sales_status, a.notes,
      a.assigned_at, a.status_updated_at,
      h.clinic_name, h.province, h.source_link, h.result_url, h.review_status, h.flag_count
    FROM sales_lead_assignments a
    JOIN hunter_leads h ON h.id = a.hunter_lead_id
    WHERE a.sales_user_id = ${salesUserId}
    ORDER BY
      CASE WHEN a.sales_status IN ('new', 'contacted', 'interested') THEN 0 ELSE 1 END,
      a.assigned_at DESC
  `;
  return rows as SalesLeadAssignment[];
}

// Updates one assignment's sales_status/notes — called from
// PATCH /api/sales/leads/[id]. The `AND sales_user_id = ${salesUserId}`
// clause is the ownership check: a sales rep can only ever touch their own
// assignments, enforced at the query level rather than a separate
// SELECT-then-check, so there's no window for one rep to edit another's
// lead. Returns null if the row doesn't exist OR belongs to someone else —
// the route treats both the same (404), which also avoids leaking whether
// a given lead id exists at all to a rep who doesn't own it.
export async function updateSalesLeadAssignment(
  id: string,
  salesUserId: string,
  updates: { salesStatus?: SalesStatus; notes?: string | null }
): Promise<SalesLeadAssignment | null> {
  const [row] = await sql`
    UPDATE sales_lead_assignments a
    SET
      sales_status = COALESCE(${updates.salesStatus ?? null}, a.sales_status),
      notes = CASE WHEN ${updates.notes !== undefined} THEN ${updates.notes ?? null} ELSE a.notes END,
      status_updated_at = CASE WHEN ${updates.salesStatus !== undefined} THEN now() ELSE a.status_updated_at END
    WHERE a.id = ${id} AND a.sales_user_id = ${salesUserId}
    RETURNING a.*
  `;
  if (!row) return null;

  const [joined] = await sql`
    SELECT
      a.id, a.hunter_lead_id, a.sales_user_id, a.sales_status, a.notes,
      a.assigned_at, a.status_updated_at,
      h.clinic_name, h.province, h.source_link, h.result_url, h.review_status, h.flag_count
    FROM sales_lead_assignments a
    JOIN hunter_leads h ON h.id = a.hunter_lead_id
    WHERE a.id = ${id}
  `;
  return (joined as SalesLeadAssignment) ?? null;
}

// --- Admin monitor (Hunter page's "เซลล์ & การกระจาย Lead" section) -------

export type SalesOverviewRow = {
  id: string;
  email: string;
  name: string;
  active: boolean;
  open_count: number; // leads currently new/contacted/interested — "ใช้ไปกี่/10"
  closed_won_count: number;
  last_activity_at: string | null;
};

// One row per sales user with their queue occupancy — powers the overview
// table. LEFT JOINs so a brand-new rep with zero assignments still shows a
// row (0/10), not missing entirely. Aggregated in SQL rather than N+1
// queries per rep since this is polled every 10-15s from the Hunter page.
export async function getSalesOverview(): Promise<SalesOverviewRow[]> {
  const rows = await sql`
    SELECT
      u.id, u.email, u.name, u.active,
      COUNT(*) FILTER (WHERE a.sales_status IN ('new', 'contacted', 'interested'))::int AS open_count,
      COUNT(*) FILTER (WHERE a.sales_status = 'closed_won')::int AS closed_won_count,
      MAX(a.status_updated_at) AS last_activity_at
    FROM sales_users u
    LEFT JOIN sales_lead_assignments a ON a.sales_user_id = u.id
    GROUP BY u.id
    ORDER BY u.created_at ASC
  `;
  return rows as SalesOverviewRow[];
}

export type SalesActivityEvent = {
  assignment_id: string;
  sales_status: SalesStatus;
  status_updated_at: string;
  clinic_name: string;
  sales_user_name: string;
};

// Recent status changes across every rep, newest first — the "เซลล์ A
// เปลี่ยน Vincent Clinic → ติดต่อแล้ว เมื่อ 2 นาทีที่แล้ว" feed. Only rows
// where status_updated_at is set (i.e. actually touched at least once —
// see migrations/011_sales_leads.sql's comment on that column), so a
// freshly-assigned-but-untouched lead never shows up as "activity".
export async function getRecentSalesActivity(limit = 20): Promise<SalesActivityEvent[]> {
  const rows = await sql`
    SELECT a.id AS assignment_id, a.sales_status, a.status_updated_at, h.clinic_name, u.name AS sales_user_name
    FROM sales_lead_assignments a
    JOIN hunter_leads h ON h.id = a.hunter_lead_id
    JOIN sales_users u ON u.id = a.sales_user_id
    WHERE a.status_updated_at IS NOT NULL
    ORDER BY a.status_updated_at DESC
    LIMIT ${limit}
  `;
  return rows as SalesActivityEvent[];
}

// --- Daily distribution (scripts/salesLeadDistributionJob.ts) ------------

export type DistributionResult = {
  salesUserId: string;
  salesUserName: string;
  assignedCount: number;
  needed: number;
};

// The core "top up every active rep to DAILY_QUOTA open leads" algorithm —
// see the design doc for the full writeup. Deliberately sequential (one
// rep at a time, in signup order — "ความเป็นธรรม" note in the design doc)
// rather than one batched query across every rep at once: each rep's
// INSERT commits before the next rep's pool SELECT runs, and the pool
// query's anti-join (no matching sales_lead_assignments row yet) is what
// keeps two reps from ever being handed the same lead, without needing any
// explicit locking — this only ever runs from one cron process at a time.
export async function distributeDailyLeads(): Promise<DistributionResult[]> {
  const activeReps = (await sql`
    SELECT id, name FROM sales_users WHERE active = true ORDER BY created_at ASC
  `) as { id: string; name: string }[];

  const results: DistributionResult[] = [];

  for (const rep of activeReps) {
    const [{ open_count }] = (await sql`
      SELECT COUNT(*)::int AS open_count
      FROM sales_lead_assignments
      WHERE sales_user_id = ${rep.id} AND sales_status IN ('new', 'contacted', 'interested')
    `) as { open_count: number }[];

    const needed = DAILY_QUOTA - open_count;
    if (needed <= 0) {
      results.push({ salesUserId: rep.id, salesUserName: rep.name, assignedCount: 0, needed: 0 });
      continue;
    }

    // Pool: completed leads with a real compliance problem, never assigned
    // to anyone yet, oldest first. review_status IS NOT NULL implicitly
    // excludes any lead completed before migrations/011_sales_leads.sql
    // (backfilled as NULL, not a value the CHECK constraint would accept
    // for "unknown") — see that migration's comment.
    const pool = (await sql`
      SELECT h.id
      FROM hunter_leads h
      WHERE h.status = 'done'
        AND h.review_status IN ('caution', 'violation')
        AND NOT EXISTS (SELECT 1 FROM sales_lead_assignments a WHERE a.hunter_lead_id = h.id)
      ORDER BY h.updated_at ASC
      LIMIT ${needed}
    `) as { id: string }[];

    for (const { id: hunterLeadId } of pool) {
      await sql`
        INSERT INTO sales_lead_assignments (hunter_lead_id, sales_user_id)
        VALUES (${hunterLeadId}, ${rep.id})
        ON CONFLICT (hunter_lead_id) DO NOTHING
      `;
    }

    results.push({ salesUserId: rep.id, salesUserName: rep.name, assignedCount: pool.length, needed });
  }

  return results;
}
