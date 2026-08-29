-- Widens businesses.specialty (added in 004_business_specialty.sql) from
-- the original 5 verticals AdCheck had case studies for, to the fuller
-- range of Thai medical facility types that มาตรา 38 พ.ร.บ.สถานพยาบาล —
-- the actual law AdCheck's AI review is built against (see
-- lib/reviewImage.ts) — applies to. Requested directly: add "โรงพยาบาล"
-- (hospital) plus other facility/specialty types actually subject to this
-- advertising law, not just the handful of verticals we happened to launch
-- case studies for.
--
-- All 6 existing values (beauty/dental/ortho/pharmacy/vet/other) are kept
-- unchanged for backward compatibility with rows already set to them —
-- this only ADDS options, never removes or renames one, so no existing
-- business's specialty silently becomes invalid.
--
-- "diet" (คลินิกลดน้ำหนัก) is included deliberately: it's one of the
-- highest-violation-rate categories สบส. itself calls out (see the
-- weight-loss-clinic enforcement story seeded in lib/articles.ts) — exactly
-- the kind of business this product exists to help stay compliant.
ALTER TABLE businesses DROP CONSTRAINT businesses_specialty_check;

ALTER TABLE businesses ADD CONSTRAINT businesses_specialty_check
  CHECK (specialty IS NULL OR specialty = ANY (ARRAY[
    'beauty', 'dental', 'ortho', 'pharmacy', 'vet', 'other',
    'hospital', 'general', 'diet', 'dermatology', 'eye', 'ent',
    'obgyn', 'pediatrics', 'fertility', 'physical_therapy',
    'traditional_medicine', 'rehab', 'mental_health'
  ]));
