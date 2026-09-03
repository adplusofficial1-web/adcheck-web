import { NextResponse } from "next/server";
import { getCurrentPlatformAdminEmail } from "@/lib/platformAdmin";
import { getHunterUserById } from "@/lib/hunterUsers";
import {
  HUNTER_MESSAGE_MAX_LENGTH,
  listHunterMessages,
  markHunterMessagesRead,
  sendHunterMessage,
} from "@/lib/hunterMessages";
import { isValidUuid, stripNulBytes } from "@/lib/validation";

// GET/POST /api/admin/hunter-messages/[hunterUserId] — one Hunter's thread
// as seen from the admin inbox (components/admin/HunterChatInbox.tsx).
// See migrations/021_hunter_messages.sql and the Hunter-side twin
// app/api/hunter/messages/route.ts.
//
// GET ?markRead=1 — the inbox passes this for the thread currently open on
// screen, which clears that room's unread badge (the Hunter's messages are
// now "seen by an admin"). The room list poll never marks anything read.
//
// POST is allowed on a deactivated Hunter's thread too — that's how an
// admin tells someone why they were turned off — the Hunter just can't
// reply until re-enabled (lib/currentHunterUser.ts only returns active
// rows).
export async function GET(req: Request, { params }: { params: { hunterUserId: string } }) {
  const adminEmail = await getCurrentPlatformAdminEmail();
  if (!adminEmail) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  if (!isValidUuid(params.hunterUserId)) {
    return NextResponse.json({ error: "ไม่พบรายการนี้" }, { status: 404 });
  }

  const url = new URL(req.url);
  try {
    const hunterUser = await getHunterUserById(params.hunterUserId);
    if (!hunterUser) return NextResponse.json({ error: "ไม่พบรายการนี้" }, { status: 404 });

    if (url.searchParams.get("markRead") === "1") {
      await markHunterMessagesRead(hunterUser.id, "admin");
    }
    const messages = await listHunterMessages(hunterUser.id);
    return NextResponse.json({
      hunter: {
        id: hunterUser.id,
        name: hunterUser.name,
        email: hunterUser.email,
        active: hunterUser.active,
        avatar_url: hunterUser.avatar_url ?? null,
      },
      messages,
    });
  } catch (e) {
    console.error(`GET /api/admin/hunter-messages/${params.hunterUserId} failed:`, e);
    return NextResponse.json({ error: "โหลดข้อความไม่สำเร็จ" }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: { hunterUserId: string } }) {
  const adminEmail = await getCurrentPlatformAdminEmail();
  if (!adminEmail) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  if (!isValidUuid(params.hunterUserId)) {
    return NextResponse.json({ error: "ไม่พบรายการนี้" }, { status: 404 });
  }

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
    const hunterUser = await getHunterUserById(params.hunterUserId);
    if (!hunterUser) return NextResponse.json({ error: "ไม่พบรายการนี้" }, { status: 404 });

    const message = await sendHunterMessage({
      hunterUserId: hunterUser.id,
      sender: "admin",
      senderEmail: adminEmail,
      body,
    });
    return NextResponse.json({ message });
  } catch (e) {
    console.error(`POST /api/admin/hunter-messages/${params.hunterUserId} failed:`, e);
    return NextResponse.json({ error: "ส่งข้อความไม่สำเร็จ" }, { status: 500 });
  }
}
