import { sql } from "@/lib/db";

// AD Plus's internal pipeline for association outreach (Admin > Marketing),
// separate from anything customer-facing — see
// migrations/007_marketing_associations.sql for the full reasoning.
export type MarketingAssociationStatus = "not_started" | "sent" | "responded" | "meeting" | "success";

export type MarketingAssociation = {
  id: string;
  name: string;
  contact: string | null;
  phase: number;
  status: MarketingAssociationStatus;
  next_followup: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

const ALLOWED_STATUS: MarketingAssociationStatus[] = ["not_started", "sent", "responded", "meeting", "success"];

// All rows for the board at app/admin/marketing/page.tsx, grouped into the
// 4 phase columns client-side (components/admin/MarketingTracker.tsx) —
// ordered so the soonest follow-up date surfaces first within an admin's
// scan of a column, same idea as lib/credits.ts:getActivePackages ordering
// by expires_at ASC.
export async function listMarketingAssociations(): Promise<MarketingAssociation[]> {
  const rows = await sql`
    SELECT id, name, contact, phase, status, next_followup, notes, created_by, created_at, updated_at
    FROM marketing_associations
    ORDER BY (next_followup IS NULL), next_followup ASC, created_at DESC
  `;
  return rows as any[];
}

export async function createMarketingAssociation(input: {
  name: string;
  contact?: string | null;
  phase?: number;
  status?: MarketingAssociationStatus;
  nextFollowup?: string | null;
  notes?: string | null;
  createdBy: string;
}): Promise<MarketingAssociation> {
  const phase = input.phase && input.phase >= 1 && input.phase <= 4 ? input.phase : 1;
  const status = input.status && ALLOWED_STATUS.includes(input.status) ? input.status : "not_started";
  const [row] = (await sql`
    INSERT INTO marketing_associations (name, contact, phase, status, next_followup, notes, created_by)
    VALUES (${input.name}, ${input.contact ?? null}, ${phase}, ${status},
      ${input.nextFollowup ?? null}, ${input.notes ?? null}, ${input.createdBy})
    RETURNING id, name, contact, phase, status, next_followup, notes, created_by, created_at, updated_at
  `) as any[];
  return row;
}

// Full-row update (the edit panel always submits every field, same pattern
// as the rest of the admin area preferring simple whole-row PATCHes over
// partial-field diffing) — updated_at is bumped explicitly since this
// table has no trigger for it.
export async function updateMarketingAssociation(
  id: string,
  input: {
    name: string;
    contact?: string | null;
    phase: number;
    status: MarketingAssociationStatus;
    nextFollowup?: string | null;
    notes?: string | null;
  }
): Promise<MarketingAssociation | null> {
  if (input.phase < 1 || input.phase > 4) throw new Error("phase ต้องอยู่ระหว่าง 1-4");
  if (!ALLOWED_STATUS.includes(input.status)) throw new Error("status ไม่ถูกต้อง");

  const rows = (await sql`
    UPDATE marketing_associations
    SET name = ${input.name}, contact = ${input.contact ?? null}, phase = ${input.phase},
      status = ${input.status}, next_followup = ${input.nextFollowup ?? null},
      notes = ${input.notes ?? null}, updated_at = now()
    WHERE id = ${id}
    RETURNING id, name, contact, phase, status, next_followup, notes, created_by, created_at, updated_at
  `) as any[];
  return rows[0] ?? null;
}

export async function deleteMarketingAssociation(id: string): Promise<boolean> {
  const rows = (await sql`
    DELETE FROM marketing_associations WHERE id = ${id} RETURNING id
  `) as any[];
  return rows.length > 0;
}
