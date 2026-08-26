import { NextResponse } from "next/server";
import { getCurrentPlatformAdminEmail } from "@/lib/platformAdmin";
import { createComplianceRule } from "@/lib/complianceRules";
import { extractTextFromFile } from "@/lib/fileTextExtract";

// POST /api/admin/knowledge-base/upload — multipart/form-data with fields:
//   file        (required) — the PDF/DOCX/TXT/MD document
//   title       (optional) — defaults to the filename without extension
//   category    (optional)
//   alwaysInclude (optional, "true"/"false" as a string — FormData has no
//                  native boolean)
//
// Runs on the Node runtime (not edge) since pdf-parse/mammoth need Node
// APIs (Buffer, fs internals) — this is the default for API routes in the
// app/ directory unless `export const runtime = "edge"` is set, which it
// isn't here.
const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB — generous for a legal PDF/DOCX, not so large a bad upload stalls the request for everyone else since reviews run sequentially on this same server (see lib/reviewImage.ts's processing comments).

export async function POST(req: Request) {
  const adminEmail = await getCurrentPlatformAdminEmail();
  if (!adminEmail) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "ต้องแนบไฟล์ (file)" }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: `ไฟล์ใหญ่เกินไป (จำกัด ${MAX_FILE_BYTES / 1024 / 1024}MB)` }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { text, warning } = await extractTextFromFile(buffer, file.name, file.type);

    if (!text) {
      // Never create an empty knowledge-base entry — an empty `content` would
      // silently match nothing forever and just clutter the admin list. Fail
      // the upload instead so the admin knows to fix the source file.
      return NextResponse.json({ error: warning || "ไม่พบข้อความในไฟล์นี้" }, { status: 422 });
    }

    const titleField = form.get("title");
    const title =
      typeof titleField === "string" && titleField.trim()
        ? titleField.trim()
        : file.name.replace(/\.[^.]+$/, "");
    const categoryField = form.get("category");
    const category = typeof categoryField === "string" && categoryField.trim() ? categoryField.trim() : null;
    const alwaysInclude = form.get("alwaysInclude") === "true";

    // Keep the ORIGINAL file bytes too (base64), separate from `text` (the
    // extracted content used for search/review) — lets an admin download the
    // exact document they uploaded later from the knowledge base list. See
    // lib/complianceRules.ts's header comment for why this is base64 text
    // rather than a `bytea` column.
    const fileBase64 = buffer.toString("base64");

    const rule = await createComplianceRule({
      title,
      category,
      content: text,
      sourceType: "upload",
      sourceFilename: file.name,
      fileBase64,
      fileMime: file.type || null,
      alwaysInclude,
      createdBy: adminEmail,
    });

    return NextResponse.json({ rule, warning }, { status: 201 });
  } catch (e: any) {
    // Without this catch, an unhandled throw anywhere above (e.g. the
    // NeonDbError that stripNulBytes in lib/fileTextExtract.ts now
    // prevents, or any other extraction/DB failure) made Next.js return an
    // empty response body, which the admin UI's `await res.json()` then
    // failed to parse as "Unexpected end of JSON input" — a confusing
    // error with no hint of what actually broke. A real JSON error body
    // here at least surfaces the actual message instead.
    console.error("POST /api/admin/knowledge-base/upload failed:", e);
    return NextResponse.json({ error: e?.message || "อัปโหลดไม่สำเร็จ" }, { status: 500 });
  }
}
