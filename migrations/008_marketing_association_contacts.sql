-- Multiple contact people per association in the Marketing pipeline
-- (Admin > Marketing, migrations/007_marketing_associations.sql) — one
-- association (e.g. ATAP) usually has several people worth reaching
-- (นายกสมาคม, เลขาธิการ, ประชาสัมพันธ์, เจ้าหน้าที่สำนักงาน), and the
-- original `marketing_associations.contact` free-text field could only
-- hold one. This table replaces that with a proper one-to-many list so
-- each person gets their own name/email/role, and the whole list can be
-- exported for a mail-merge send (see /api/admin/marketing/contacts
-- CSV export) instead of emailing one contact at a time by hand.
CREATE TABLE marketing_association_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  association_id uuid NOT NULL REFERENCES marketing_associations(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  last_name text,
  email text,
  role text,
  phone text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_marketing_association_contacts_association ON marketing_association_contacts (association_id);
