-- Adds a medical-specialty field to `businesses`, separate from `type`
-- (which only ever holds the account kind 'clinic'/'agency', not medical
-- specialty — see lib/monthlyTrendReport.ts's header comment for why the
-- /admin/inside report couldn't break down by specialty until this existed).
--
-- Nullable, no backfill: existing rows start unset. This only lets NEW data
-- accumulate going forward (settings UI added alongside this migration) —
-- there is no reliable way to infer a clinic's specialty for rows that
-- already exist, so this deliberately does not guess.
--
-- Options mirror the 5 verticals AdCheck already has case studies for (see
-- claude/adcheck-organic-marketing-strategy.md), plus 'other' as a catch-all
-- for anything outside those five. Only meaningful when type = 'clinic';
-- agency accounts are expected to leave this null.
ALTER TABLE businesses ADD COLUMN specialty text;

ALTER TABLE businesses ADD CONSTRAINT businesses_specialty_check
  CHECK (specialty IS NULL OR specialty = ANY (ARRAY['beauty', 'dental', 'ortho', 'pharmacy', 'vet', 'other']));
