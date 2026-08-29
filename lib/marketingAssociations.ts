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
  contact_count: number;
};

// One person at an association (Admin > Marketing edit panel's "รายชื่อ
// ผู้ติดต่อ" list) — see migrations/008_marketing_association_contacts.sql
// for why this replaced the single `contact` free-text field.
export type MarketingAssociationContact = {
  id: string;
  association_id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  role: string | null;
  phone: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

// Flat row for the "ส่งอีเมลไปยังรายชื่อสมาคมทั้งหมด" export — every
// contact across every association, with the association name attached,
// so a CSV export doesn't need a second lookup per row.
export type MarketingContactWithAssociation = MarketingAssociationContact & {
  association_name: string;
};

const ALLOWED_STATUS: MarketingAssociationStatus[] = ["not_started", "sent", "responded", "meeting", "success"];

// All rows for the board at app/admin/marketing/page.tsx, grouped into the
// 4 phase columns client-side (components/admin/MarketingTracker.tsx) —
// ordered so the soonest follow-up date surfaces first within an admin's
// scan of a column, same idea as lib/credits.ts:getActivePackages ordering
// by expires_at ASC.
export async function listMarketingAssociations(): Promise<MarketingAssociation[]> {
  // LEFT JOIN + COUNT so a card can show "3 ผู้ติดต่อ" without a separate
  // query per association — contact_count is 0 (not null) for associations
  // with no contacts yet thanks to the LEFT JOIN + COUNT(contacts.id).
  const rows = await sql`
    SELECT a.id, a.name, a.contact, a.phase, a.status, a.next_followup, a.notes,
      a.created_by, a.created_at, a.updated_at,
      COUNT(c.id)::int AS contact_count
    FROM marketing_associations a
    LEFT JOIN marketing_association_contacts c ON c.association_id = a.id
    GROUP BY a.id
    ORDER BY (a.next_followup IS NULL), a.next_followup ASC, a.created_at DESC
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

// All contacts for one association, newest first — the list rendered
// inside the edit panel at components/admin/MarketingTracker.tsx when an
// admin opens a card.
export async function listContactsForAssociation(associationId: string): Promise<MarketingAssociationContact[]> {
  const rows = await sql`
    SELECT id, association_id, first_name, last_name, email, role, phone, notes, created_at, updated_at
    FROM marketing_association_contacts
    WHERE association_id = ${associationId}
    ORDER BY created_at ASC
  `;
  return rows as any[];
}

// Every contact across every association, for the "ดาวน์โหลดรายชื่อ
// อีเมลทั้งหมด" export button on app/admin/marketing/page.tsx — a mail-merge
// source list, not an auto-send (AdCheck never sends email on its own;
// the admin takes this CSV into Gmail/Outlook mail merge or a BCC list).
export async function listAllMarketingContacts(): Promise<MarketingContactWithAssociation[]> {
  const rows = await sql`
    SELECT c.id, c.association_id, c.first_name, c.last_name, c.email, c.role, c.phone, c.notes,
      c.created_at, c.updated_at, a.name AS association_name
    FROM marketing_association_contacts c
    JOIN marketing_associations a ON a.id = c.association_id
    ORDER BY a.name ASC, c.created_at ASC
  `;
  return rows as any[];
}

export async function createMarketingContact(
  associationId: string,
  input: {
    firstName: string;
    lastName?: string | null;
    email?: string | null;
    role?: string | null;
    phone?: string | null;
    notes?: string | null;
  }
): Promise<MarketingAssociationContact> {
  const [row] = (await sql`
    INSERT INTO marketing_association_contacts (association_id, first_name, last_name, email, role, phone, notes)
    VALUES (${associationId}, ${input.firstName}, ${input.lastName ?? null}, ${input.email ?? null},
      ${input.role ?? null}, ${input.phone ?? null}, ${input.notes ?? null})
    RETURNING id, association_id, first_name, last_name, email, role, phone, notes, created_at, updated_at
  `) as any[];
  return row;
}

export async function updateMarketingContact(
  id: string,
  input: {
    firstName: string;
    lastName?: string | null;
    email?: string | null;
    role?: string | null;
    phone?: string | null;
    notes?: string | null;
  }
): Promise<MarketingAssociationContact | null> {
  const rows = (await sql`
    UPDATE marketing_association_contacts
    SET first_name = ${input.firstName}, last_name = ${input.lastName ?? null}, email = ${input.email ?? null},
      role = ${input.role ?? null}, phone = ${input.phone ?? null}, notes = ${input.notes ?? null}, updated_at = now()
    WHERE id = ${id}
    RETURNING id, association_id, first_name, last_name, email, role, phone, notes, created_at, updated_at
  `) as any[];
  return rows[0] ?? null;
}

export async function deleteMarketingContact(id: string): Promise<boolean> {
  const rows = (await sql`
    DELETE FROM marketing_association_contacts WHERE id = ${id} RETURNING id
  `) as any[];
  return rows.length > 0;
}
