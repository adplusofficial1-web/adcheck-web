-- Hunter ↔ admin direct chat (2569-09-03, per user request "อยากให้ Hunter
-- มีช่องสำหรับ แชทคุยสอบถาม กับ Admin Hunter โดยตรง").
--
-- One conversation per Hunter (hunter_user_id is the "room"): the Hunter
-- sees only their own thread (the "แชทกับทีมงาน" tab on /hunter,
-- components/hunter/HunterChatTab.tsx), while every platform admin sees
-- every thread in one inbox (the "แชท" tab on /admin/marketing/hunter,
-- components/admin/HunterChatInbox.tsx). Text only, no attachments — the
-- user chose that scope explicitly (see the project doc); a Hunter who
-- needs to show a picture pastes a link.
--
-- read_at is set per message, per side: a Hunter opening their thread
-- marks every unread *admin* message read, and an admin opening a thread
-- marks that Hunter's unread *hunter* messages read (see
-- lib/hunterMessages.ts:markRead). Unread badges are just
-- COUNT(*) WHERE read_at IS NULL filtered by sender — no separate counter
-- to keep in sync. sender_email is the admin's Google email for admin rows
-- (there can be several admins, and the Hunter is shown "ทีมงาน" for all of
-- them) and NULL for hunter rows (the sender is the room's Hunter).
CREATE TABLE IF NOT EXISTS hunter_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hunter_user_id UUID NOT NULL REFERENCES hunter_users(id) ON DELETE CASCADE,
  sender TEXT NOT NULL CHECK (sender IN ('hunter', 'admin')),
  sender_email TEXT,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ
);

-- Thread view: newest-first page of one Hunter's messages.
CREATE INDEX IF NOT EXISTS hunter_messages_room_created_idx
  ON hunter_messages (hunter_user_id, created_at DESC);

-- Unread badges (both sides) and the admin inbox's "รอตอบ" ordering only
-- ever look at unread rows, which are a tiny fraction of the table.
CREATE INDEX IF NOT EXISTS hunter_messages_unread_idx
  ON hunter_messages (hunter_user_id, sender)
  WHERE read_at IS NULL;
