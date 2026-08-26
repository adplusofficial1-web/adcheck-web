import { NextResponse } from "next/server";
import { getCurrentPlatformAdminEmail } from "@/lib/platformAdmin";
import { getComplianceRuleFile } from "@/lib/complianceRules";

// GET /api/admin/knowledge-base/[id]/file — downloads the ORIGINAL
// uploaded document (PDF/DOCX/TXT) exactly as the admin uploaded it, so
// staff can re-open the source document later instead of only seeing the
// extracted text. Only present for rows created via the "upload" path
// where the raw bytes were captured — see lib/complianceRules.ts and
// migrations/004_add_source_file_columns.sql. Manually-typed rules, and
// uploads made before this feature shipped (no bytes were ever stored for
// those), have nothing to serve and 404.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const adminEmail = await getCurrentPlatformAdminEmail();
  if (!adminEmail) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const file = await getComplianceRuleFile(params.id);
  if (!file) {
    return NextResponse.json({ error: "ไม่พบไฟล์ต้นฉบับสำหรับรายการนี้" }, { status: 404 });
  }

  const bytes = Buffer.from(file.base64, "base64");
  const filename = file.filename || "document";

  return new NextResponse(bytes, {
    headers: {
      "Content-Type": file.mime || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
      "Content-Length": String(bytes.length),
    },
  });
}
