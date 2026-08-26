import { NextResponse } from "next/server";
import { getCurrentPlatformAdminEmail } from "@/lib/platformAdmin";
import { listComplianceRules, createComplianceRule } from "@/lib/complianceRules";

// GET /api/admin/knowledge-base?q=... — list + search (admin's manual
// search box, ranked by the same trigram similarity reviewImage.ts uses
// for context matching, so an admin can sanity-check "what would this
// caption match?" before it ever reaches a real review).
export async function GET(req: Request) {
  const adminEmail = await getCurrentPlatformAdminEmail();
  if (!adminEmail) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? undefined;
  const rules = await listComplianceRules({ q });
  return NextResponse.json({ rules });
}

// POST /api/admin/knowledge-base — create a rule by typing it directly
// (the "พิมพ์/วางข้อความ" path). File uploads go through
// /api/admin/knowledge-base/upload instead, since that route needs to
// parse multipart form data and extract text server-side first.
export async function POST(req: Request) {
  const adminEmail = await getCurrentPlatformAdminEmail();
  if (!adminEmail) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const title = (body.title || "").trim();
  const content = (body.content || "").trim();
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
}
