import { sql } from "@/lib/db";

// Hunter ↔ admin direct chat (2569-09-03) — data layer for
// migrations/021_hunter_messages.sql. One thread per Hunter; see that
// migration's comment for the model. Two consumers:
//   * the Hunter's own thread — app/api/hunter/messages/route.ts
//     (components/hunter/HunterChatTab.tsx)
//   * the admin inbox over every thread — app/api/admin/hunter-messages/
//     (components/admin/HunterChatInbox.tsx)
// Both poll on an interval (same pattern as the rest of /hunter and the
// admin Hunter page — there's no websocket infrastructure in this app), so
// every read here is a cheap indexed query that's fine to hit every ~10s.

export type HunterMessageSender = "hunter" | "admin";

export type HunterMessage = {
  id: string;
  hunter_user_id: string;
  sender: HunterMessageSender;
  // Admin's Google email for admin rows, null for hunter rows. The Hunter
  // side never renders this (all admins show as "ทีมงาน"); the admin inbox
  // shows it so several admins can tell who already replied.
  sender_email: string | null;
  body: string;
  created_at: string;
  read_at: string | null;
};

// Body limit mirrors the CHECK in migrations/021 (1..2000 chars) — enforced
// here too so the API can return a Thai message instead of a raw constraint
// error.
export const HUNTER_MESSAGE_MAX_LENGTH = 2000;

// Hard cap on how many messages one thread fetch returns. The threads are
// short (support chat, not a feed) and the UI shows the whole thread, so
// this is a safety net against a runaway room, not pagination.
const THREAD_LIMIT = 300;

// Oldest-first so the UI can render top-to-bottom without reversing.
export async function listHunterMessages(hunterUserId: string): Promise<HunterMessage[]> {
  const rows = (await sql`
    SELECT * FROM (
      SELECT id, hunter_user_id, sender, sender_email, body, created_at, read_at
      FROM hunter_messages
      WHERE hunter_user_id = ${hunterUserId}
      ORDER BY created_at DESC
      LIMIT ${THREAD_LIMIT}
    ) latest
    ORDER BY created_at ASC
  `) as HunterMessage[];
  return rows;
}

export async function sendHunterMessage(params: {
  hunterUserId: string;
  sender: HunterMessageSender;
  senderEmail: string | null;
  body: string;
}): Promise<HunterMessage> {
  const [row] = (await sql`
    INSERT INTO hunter_messages (hunter_user_id, sender, sender_email, body)
    VALUES (${params.hunterUserId}, ${params.sender}, ${params.senderEmail}, ${params.body})
    RETURNING id, hunter_user_id, sender, sender_email, body, created_at, read_at
  `) as HunterMessage[];
  return row;
}

// "I (the `reader` side) have now seen everything the OTHER side sent in
// this thread." Called by whichever side just loaded the thread — so
// opening the chat tab is what clears the badge, no explicit "mark read"
// button. Idempotent; the partial index in migrations/021 makes the
// no-unread case free.
export async function markHunterMessagesRead(hunterUserId: string, reader: HunterMessageSender): Promise<void> {
  const otherSide: HunterMessageSender = reader === "hunter" ? "admin" : "hunter";
  await sql`
    UPDATE hunter_messages
    SET read_at = now()
    WHERE hunter_user_id = ${hunterUserId}
      AND sender = ${otherSide}
      AND read_at IS NULL
  `;
}

// Badge count for the Hunter's own tab: admin messages they haven't seen.
export async function countUnreadForHunter(hunterUserId: string): Promise<number> {
  const [row] = (await sql`
    SELECT COUNT(*)::int AS n FROM hunter_messages
    WHERE hunter_user_id = ${hunterUserId} AND sender = 'admin' AND read_at IS NULL
  `) as { n: number }[];
  return row?.n ?? 0;
}

export type HunterChatRoom = {
  hunter_user_id: string;
  name: string;
  email: string;
  active: boolean;
  avatar_url: string | null;
  // Hunter messages no admin has opened yet — the per-room badge, summed
  // for the tab badge.
  unread_count: number;
  last_message_at: string | null;
  last_message_body: string | null;
  last_message_sender: HunterMessageSender | null;
};

// Admin inbox: every Hunter (including ones who never wrote — so an admin
// can start a conversation, e.g. to welcome a new self-registered Hunter
// who's waiting for approval), ordered rooms-with-unread first, then most
// recent activity, then Hunters who never chatted (alphabetical).
export async function listHunterChatRooms(): Promise<HunterChatRoom[]> {
  const rows = (await sql`
    SELECT
      hu.id AS hunter_user_id,
      hu.name,
      hu.email,
      hu.active,
      hu.avatar_url,
      COALESCE(u.unread_count, 0)::int AS unread_count,
      last.created_at AS last_message_at,
      last.body AS last_message_body,
      last.sender AS last_message_sender
    FROM hunter_users hu
    LEFT JOIN (
      SELECT hunter_user_id, COUNT(*) AS unread_count
      FROM hunter_messages
      WHERE sender = 'hunter' AND read_at IS NULL
      GROUP BY hunter_user_id
    ) u ON u.hunter_user_id = hu.id
    LEFT JOIN LATERAL (
      SELECT created_at, body, sender
      FROM hunter_messages m
      WHERE m.hunter_user_id = hu.id
      ORDER BY created_at DESC
      LIMIT 1
    ) last ON true
    ORDER BY
      (COALESCE(u.unread_count, 0) > 0) DESC,
      last.created_at DESC NULLS LAST,
      hu.name ASC
  `) as HunterChatRoom[];
  return rows;
}

// Tab badge for the admin page: total Hunter messages awaiting a reply.
export async function countUnreadForAdmin(): Promise<number> {
  const [row] = (await sql`
    SELECT COUNT(*)::int AS n FROM hunter_messages
    WHERE sender = 'hunter' AND read_at IS NULL
  `) as { n: number }[];
  return row?.n ?? 0;
}
