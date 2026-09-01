-- Hunter profile picture (2569-09-01, per user request "หน้าตั้งค่าให้เพิ่ม
-- รูปประจำตัวได้"). Mirrors businesses.avatar_url exactly (see
-- app/api/settings/profile/route.ts and lib/uploadLimits.ts's
-- validateAvatarDataUrl / MAX_AVATAR_SIZE_BYTES / ALLOWED_AVATAR_MEDIA_TYPES,
-- reused as-is for this column too): stored as a client-produced
-- `data:<mime>;base64,<data>` URL, same "inline until real object storage
-- (R2) is wired up" tradeoff as every other avatar/image field in this
-- codebase.
ALTER TABLE hunter_users
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;
