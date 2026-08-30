import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentBusiness } from "@/lib/currentBusiness";
import { stripNulBytes } from "@/lib/validation";
import { validateAvatarDataUrl } from "@/lib/uploadLimits";

// Updates the clinic's display name and/or avatar photo.
// avatarBase64 is a full data: URL produced client-side by FileReader
// (same pattern as app/upload/UploadForm.tsx) — stored inline like
// submission images until real object storage (R2) is wired up.
export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const name: string | undefined =
      typeof body.name === "string" ? stripNulBytes(body.name).trim() : undefined;
    const avatarBase64: string | undefined =
      typeof body.avatarBase64 === "string" && body.avatarBase64.startsWith("data:")
        ? body.avatarBase64
        : undefined;

    if (name !== undefined && name.length === 0) {
      return NextResponse.json({ error: "ชื่อคลินิกห้ามเว้นว่าง" }, { status: 400 });
    }
    if (name === undefined && avatarBase64 === undefined) {
      return NextResponse.json({ error: "ไม่มีข้อมูลให้บันทึก" }, { status: 400 });
    }
    // FIX (bug audit round 2 #8): previously only checked the value started
    // with "data:" — no size/type check at all, unlike submission images
    // (lib/uploadLimits.ts). An oversized or non-image file stored here
    // bloats every query that selects businesses.* (agency dashboard,
    // history, results pages all read that row).
    if (avatarBase64 !== undefined) {
      const avatarError = validateAvatarDataUrl(avatarBase64);
      if (avatarError) {
        return NextResponse.json({ error: avatarError }, { status: 400 });
      }
    }

    const business = await getCurrentBusiness();
    if (!business) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const [updated] = await sql`
      UPDATE businesses
      SET
        name = COALESCE(${name ?? null}, name),
        avatar_url = COALESCE(${avatarBase64 ?? null}, avatar_url),
        updated_at = now()
      WHERE id = ${business.id}
      RETURNING id, name, avatar_url
    `;

    return NextResponse.json({ business: updated });
  } catch (e: any) {
    console.error("PATCH /api/settings/profile failed:", e);
    return NextResponse.json({ error: "บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }
}
