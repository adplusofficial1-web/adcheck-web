-- Hunter Freelancer Page — separate whitelist for the external Hunter
-- freelancers, mirroring migrations/011_sales_leads.sql's sales_users
-- table exactly (same reasoning: this roster changes more often than
-- platform admins, so a DB table an admin edits via UI beats an env var
-- allowlist). See claude project doc "Hunter Freelancer Page - Design.md"
-- for the full feature writeup: freelancers get their own /hunter area
-- (Gmail-whitelist login, read-only view of the Hunter queue — clinic name
-- + a copy-result-link button), completely separate from
-- /admin/marketing/hunter, which stays platform-admin-only.

CREATE TABLE hunter_users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
