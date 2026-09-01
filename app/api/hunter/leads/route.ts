import { NextResponse } from "next/server";
import { getCurrentHunterUser } from "@/lib/currentHunterUser";
import { listHunterLeadsPublicView } from "@/lib/hunterLeads";

// GET /api/hunter/leads — the read-only feed for the Hunter Freelancer
// Page (/hunter). Gated by lib/currentHunterUser.ts (an active
// hunter_users row), not getCurrentPlatformAdminEmail — this is a
// deliberately separate, narrower audience from
// GET /api/admin/hunter (the full admin queue with edit/delete/run
// controls). Returns every lead in the queue (not scoped per-freelancer —
// unlike sales leads, Hunter leads aren't assigned to individual people,
// everyone hunting sees the same shared list) via
// listHunterLeadsPublicView, which already excludes internal-only fields
// (image_urls, note, last_error).
export async function GET() {
  const hunterUser = await getCurrentHunterUser();
  if (!hunterUser) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const leads = await listHunterLeadsPublicView();
    return NextResponse.json({ leads });
  } catch (e) {
    console.error("GET /api/hunter/leads failed:", e);
    return NextResponse.json({ error: "โหลดข้อมูลไม่สำเร็จ" }, { status: 500 });
  }
}
