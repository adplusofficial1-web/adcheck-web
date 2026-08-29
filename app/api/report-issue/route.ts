import { NextResponse } from "next/server";
import { getCurrentBusiness } from "@/lib/currentBusiness";
import { createIssueReport, CATEGORY_LABEL } from "@/lib/issueReports";

// POST /api/report-issue — the signed-in business's own detailed problem
// report, submitted from /report-problem (components/ReportProblemForm.tsx).
// Body: { items: [{ category, detail }], message? }. Every entry in
// `items` must be one of the known category ids (see
// lib/issueReports.ts:CATEGORIES) and must carry a non-empty detail — the
// form already enforces both client-side, but the server never trusts
// that alone (same reasoning as every other POST route in this app).
export async function POST(req: Request) {
  const business = await getCurrentBusiness();
  if (!business) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const rawItems = Array.isArray(body.items) ? body.items : [];
  const message = typeof body.message === "string" ? body.message : null;

  if (rawItems.length === 0) {
    return NextResponse.json({ error: "กรุณาเลือกหัวข้อปัญหาอย่างน้อย 1 ข้อ" }, { status: 400 });
  }

  const items: { category: string; label: string; detail: string }[] = [];
  for (const raw of rawItems) {
    const category = typeof raw?.category === "string" ? raw.category : "";
    const detail = typeof raw?.detail === "string" ? raw.detail.trim() : "";
    const label = CATEGORY_LABEL[category];
    if (!label) {
      return NextResponse.json({ error: "หัวข้อปัญหาไม่ถูกต้อง" }, { status: 400 });
    }
    if (!detail) {
      return NextResponse.json(
        { error: `กรุณาระบุรายละเอียดสำหรับหัวข้อ "${label}"` },
        { status: 400 }
      );
    }
    items.push({ category, label, detail });
  }

  try {
    const created = await createIssueReport(business.id, business.contact_email ?? null, items, message);
    return NextResponse.json({ ok: true, id: created.id });
  } catch (e: any) {
    console.error("Failed to create issue report:", e);
    return NextResponse.json({ error: "ส่งรายงานไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }
}
