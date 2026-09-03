import { NextResponse } from "next/server";
import { getCurrentHunterUser } from "@/lib/currentHunterUser";
import {
  HUNTER_MESSAGE_MAX_LENGTH,
  countUnreadForHunter,
  listHunterMessages,
  markHunterMessagesRead,
  sendHunterMessage,
} from "@/lib/hunterMessages";
import { stripNulBytes } from "@/lib/validation";

// GET/POST /api/hunter/messages — the Hunter's own chat thread with the
// admin team (the "แชทกับทีมงาน" tab on /hunter,
// components/hunter/HunterChatTab.tsx). See migrations/021_hunter_messages.sql.
//
// The room is always the signed-in Hunter (lib/currentHunterUser.ts) —
// there's no id in the URL, so a Hunter can't address anyone else's thread.
//
// GET ?markRead=1 — the chat tab passes this while it's open on screen, so
// loading the thread is what clears the Hunter's badge (and tells the admin
// their reply was seen). The header badge poll (HunterShell) calls GET
// ?countOnly=1 instead, which never marks anything read.
export async function GET(req: Request) {
  const hunterUser = await getCurrentHunterUser();
  if (!hunterUser) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const url = new URL(req.url);
  try {
    if (url.searchParams.get("countOnly") === "1") {
      const unread = await countUnreadForHunter(hunterUser.id);
      return NextResponse.json({ unread });
    }
    if (url.searchParams.get("markRead") === "1") {
      await markHunterMessagesRead(hunterUser.id, "hunter");
    }
    const messages = await listHunterMessages(hunterUser.id);
    return NextResponse.json({ messages });
  } catch (e) {
    console.error("GET /api/hunter/messages failed:", e);
    return NextResponse.json({ error: "โหลดข้อความไม่สำเร็จ" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const hunterUser = await getCurrentHunterUser();
  if (!hunterUser) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const payload = await req.json().catch(() => null as any);
  const body = typeof payload?.body === "string" ? stripNulBytes(payload.body).trim() : "";
  if (!body) {
    return NextResponse.json({ error: "กรุณาพิมพ์ข้อความก่อนส่ง" }, { status: 400 });
  }
  if (body.length > HUNTER_MESSAGE_MAX_LENGTH) {
    return NextResponse.json(
      { error: `ข้อความต้องไม่เกิน ${HUNTER_MESSAGE_MAX_LENGTH} ตัวอักษร` },
      { status: 400 }
    );
  }

  try {
    const message = await sendHunterMessage({
      hunterUserId: hunterUser.id,
      sender: "hunter",
      senderEmail: null,
      body,
    });
    return NextResponse.json({ message });
  } catch (e) {
    console.error("POST /api/hunter/messages failed:", e);
    return NextResponse.json({ error: "ส่งข้อความไม่สำเร็จ" }, { status: 500 });
  }
}
