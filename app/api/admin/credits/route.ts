import { NextResponse } from "next/server";
import { getCurrentPlatformAdminEmail } from "@/lib/platformAdmin";
import { listCreditGrants, grantCredits, findBusinessByEmail } from "@/lib/creditGrants";

const MAX_GRANT_AMOUNT = 1000; // sanity ceiling — a typo like an extra zero shouldn't silently hand out 5,000 credits.

// GET /api/admin/credits?lookupEmail=... — two jobs sharing one route:
//   - no query: the grant history table on app/admin/credits/page.tsx.
//   - lookupEmail set: the grant form's "หา clinic" step, so the admin sees
//     the clinic's name and current balance before submitting a grant
//     rather than typing an email and hoping it's the right one.
export async function GET(req: Request) {
  const adminEmail = await getCurrentPlatformAdminEmail();
  if (!adminEmail) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const { searchParams } = new URL(req.url);
    const lookupEmail = searchParams.get("lookupEmail");
    if (lookupEmail) {
      const business = await findBusinessByEmail(lookupEmail);
      if (!business) return NextResponse.json({ error: "ไม่พบคลินิกที่ใช้อีเมลนี้" }, { status: 404 });
      return NextResponse.json({ business });
    }

    const grants = await listCreditGrants();
    return NextResponse.json({ grants });
  } catch (e: any) {
    // See app/api/admin/knowledge-base/route.ts's GET handler for why this
    // catch matters — same reasoning, same fix.
    console.error("GET /api/admin/credits failed:", e);
    return NextResponse.json({ error: e?.message || "โหลดข้อมูลไม่สำเร็จ" }, { status: 500 });
  }
}

// POST /api/admin/credits — grant free credits to one clinic by email.
// Looked up fresh by email here too (not just trusting a businessId the
// client already has from the GET lookup above) so the grant always
// targets whichever business currently owns that email, even if the admin
// left the form open a while.
export async function POST(req: Request) {
  const adminEmail = await getCurrentPlatformAdminEmail();
  if (!adminEmail) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const body = await req.json();
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const amount = Number(body.amount);
    const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : null;

    if (!email) {
      return NextResponse.json({ error: "กรุณาระบุอีเมลคลินิก" }, { status: 400 });
    }
    if (!Number.isInteger(amount) || amount <= 0) {
      return NextResponse.json({ error: "จำนวนเครดิตต้องเป็นจำนวนเต็มมากกว่า 0" }, { status: 400 });
    }
    if (amount > MAX_GRANT_AMOUNT) {
      return NextResponse.json({ error: `จำนวนเครดิตต่อครั้งต้องไม่เกิน ${MAX_GRANT_AMOUNT}` }, { status: 400 });
    }

    const business = await findBusinessByEmail(email);
    if (!business) {
      return NextResponse.json({ error: "ไม่พบคลินิกที่ใช้อีเมลนี้" }, { status: 404 });
    }

    const grant = await grantCredits(business.id, amount, reason, adminEmail);
    return NextResponse.json({ grant }, { status: 201 });
  } catch (e: any) {
    console.error("POST /api/admin/credits failed:", e);
    return NextResponse.json({ error: e?.message || "ให้เครดิตไม่สำเร็จ" }, { status: 500 });
  }
}
