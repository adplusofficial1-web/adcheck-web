import { NextResponse } from "next/server";
import { getCurrentPlatformAdminEmail } from "@/lib/platformAdmin";
import { listComplianceRules, createComplianceRule } from "@/lib/complianceRules";

// Postgres text columns reject the NUL byte outright, so strip it
// defensively before any INSERT — same reasoning as
// lib/fileTextExtract.ts's stripNulBytes, which handles the file-upload
// path. Pasted-in text is less likely to carry one than an extracted
// PDF/DOCX, but a stray NUL from a bad copy-paste would otherwise crash
// createComplianceRule()'s INSERT the same way. Built via
// String.fromCharCode(0) rather than a regex escape literal so this
// source file itself never has to contain the raw byte.
const NUL = String.fromCharCode(0);
function stripNulBytes(text: string): string {
  return text.split(NUL).join("");
}

// GET /api/admin/knowledge-base?q=... — list + search (admin's manual
// search box, ranked by the same trigram similarity reviewImage.ts uses
// for context matching, so an admin can sanity-check "what would this
// caption match?" before it ever reaches a real review).
export async function GET(req: Request) {
  const adminEmail = await getCurrentPlatformAdminEmail();
  if (!adminEmail) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") ?? undefined;
    const rules = await listComplianceRules({ q });
    return NextResponse.json({ rules });
  } catch (e: any) {
    // Without this catch, an unhandled throw here (e.g. a bad DB
    // connection) makes Next.js return an empty response body, which the
    // admin UI's `await res.json()` then fails to parse as "Unexpected end
    // of JSON input" — a confusing dead end with no clue what broke. A
    // real JSON error body at least gets the actual message in front of
    // whoever's debugging it.
    console.error("GET /api/admin/knowledge-base failed:", e);
    return NextResponse.json({ error: e?.message || "เกิดข้อผิดพลาดในการโหลดคลังความรู้" }, { status: 500 });
  }
}

// POST /api/admin/knowledge-base — create a rule by typing it directly
// (the "พิมพ์/วางข้อความ" path). File uploads go through
// /api/admin/knowledge-base/upload instead, since that route needs to
// parse multipart form data and extract text server-side first.
export async function POST(req: Request) {
  const adminEmail = await getCurrentPlatformAdminEmail();
  if (!adminEmail) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const body = await req.json();
    const title = (body.title || "").trim();
    const content = stripNulBytes(body.content || "").trim();
    const category = body.category ? String(body.category).trim() : null;
    const alwaysInclude = Boolean(body.alwaysInclude);

    if (!title || !content) {
      return NextResponse.json({ error: "ต้องระบุหัวข้อและเนื้อหา" }, { status: 400 });
    }

    const rule = await createComplianceRule({
      title,
      category,
      content,
      sourceType: "manual",
      alwaysInclude,
      createdBy: adminEmail,
    });
    return NextResponse.json({ rule }, { status: 201 });
  } catch (e: any) {
    // See the GET handler's comment above — same reasoning, same fix.
    console.error("POST /api/admin/knowledge-base failed:", e);
    return NextResponse.json({ error: e?.message || "บันทึกไม่สำเร็จ" }, { status: 500 });
  }
}
