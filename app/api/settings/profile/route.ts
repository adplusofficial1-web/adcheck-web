import { NextResponse } from "next/server";
import { sql, getDemoBusiness } from "@/lib/db";

// Updates the clinic's display name and/or avatar photo.
// avatarBase64 is a full data: URL produced client-side by FileReader
// (same pattern as app/upload/UploadForm.tsx) — stored inline like
// submission images until real object storage (R2) is wired up.
export async function PATCH(req: Request) {
  const body = await req.json();
  const name: string | undefined = typeof body.name === "string" ? body.name.trim() : undefined;
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

  const business = await getDemoBusiness();
  if (!business) {
    return NextResponse.json({ error: "demo business not found" }, { status: 500 });
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
}
