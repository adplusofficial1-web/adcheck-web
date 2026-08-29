import { NextResponse } from "next/server";
import { getCurrentPlatformAdminEmail } from "@/lib/platformAdmin";
import { getComplianceRule } from "@/lib/complianceRules";
import { buildComplianceRuleDocx, safeExportFilename } from "@/lib/complianceRuleDocx";

// GET /api/admin/knowledge-base/[id]/docx — generates a .docx of this
// knowledge-base row's TITLE/CATEGORY/CONTENT on demand (not the original
// uploaded file, which is what /[id]/file already serves — this exists
// so every row has a Word download, including ones typed directly with no
// uploaded file at all, and ones uploaded as PDF/TXT/MD where the admin
// still wants an editable .docx copy).
//
// Runs on the Node runtime (default for an app/ API route unless `export
// const runtime = "edge"` is set, which it isn't here) — same requirement
// pdf-parse/mammoth already impose on the upload route, and `docx`'s
// Packer needs Buffer too.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const adminEmail = await getCurrentPlatformAdminEmail();
  if (!adminEmail) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const rule = await getComplianceRule(params.id);
  if (!rule) return NextResponse.json({ error: "ไม่พบรายการนี้ในคลังความรู้" }, { status: 404 });

  const buffer = await buildComplianceRuleDocx(rule);
  const filename = safeExportFilename(rule.title, "docx");

  // `docx`'s Packer.toBuffer() resolves its own Buffer type from its
  // nested node_modules, which TS treats as structurally distinct from
  // this project's own Buffer<ArrayBufferLike> (they're the same bytes at
  // runtime, just a nominal mismatch against NextResponse's BodyInit) —
  // wrapping in Uint8Array sidesteps that identity issue entirely.
  const body = new Uint8Array(buffer);

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
      "Content-Length": String(body.length),
    },
  });
}
