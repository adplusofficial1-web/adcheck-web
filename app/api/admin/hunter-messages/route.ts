import { NextResponse } from "next/server";
import { getCurrentPlatformAdminEmail } from "@/lib/platformAdmin";
import { countUnreadForAdmin, listHunterChatRooms } from "@/lib/hunterMessages";

// GET /api/admin/hunter-messages — the admin chat inbox's room list (every
// Hunter, unread-first — see lib/hunterMessages.ts:listHunterChatRooms)
// for components/admin/HunterChatInbox.tsx, plus the total unread count
// that drives the "แชท" tab badge on /admin/marketing/hunter
// (components/admin/HunterMarketingTabs.tsx polls this with ?countOnly=1
// so the badge updates even while another tab is open).
// Per-thread read/reply is app/api/admin/hunter-messages/[hunterUserId]/route.ts.
export async function GET(req: Request) {
  const adminEmail = await getCurrentPlatformAdminEmail();
  if (!adminEmail) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const url = new URL(req.url);
  try {
    const unread = await countUnreadForAdmin();
    if (url.searchParams.get("countOnly") === "1") {
      return NextResponse.json({ unread });
    }
    const rooms = await listHunterChatRooms();
    return NextResponse.json({ rooms, unread });
  } catch (e) {
    console.error("GET /api/admin/hunter-messages failed:", e);
    return NextResponse.json({ error: "โหลดรายการแชทไม่สำเร็จ" }, { status: 500 });
  }
}
