import { NextResponse } from "next/server";
import { getCurrentHunterUser } from "@/lib/currentHunterUser";
import { updateHunterProfile, updateHunterPayout, type HunterPayoutMethod } from "@/lib/hunterUsers";
import { stripNulBytes } from "@/lib/validation";

// GET/PATCH /api/hunter/settings — the /hunter page's "ตั้งค่า" tab: a
// Hunter's own personal details (name/phone/LINE ID, tax info) and payout
// destination (PromptPay or bank account). Both live directly on
// hunter_users (see migrations/014_hunter_referral_commissions.sql) since
// every field here has exactly one value per Hunter. GET returns the
// current row minus internal bookkeeping fields (active/created_at aren't
// this Hunter's to see/edit from here — that's the admin roster's job).
export async function GET() {
  const hunterUser = await getCurrentHunterUser();
  if (!hunterUser) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { active, created_at, ...settings } = hunterUser as any;
  return NextResponse.json({ settings });
}

const PAYOUT_METHODS: HunterPayoutMethod[] = ["promptpay", "bank"];

export async function PATCH(req: Request) {
  const hunterUser = await getCurrentHunterUser();
  if (!hunterUser) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null as any);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  try {
    // Two independent sub-forms on the same tab (ข้อมูลส่วนตัว vs
    // ข้อมูลสำหรับออกเอกสารภาษี vs ช่องทางรับเงิน) — the request only ever
    // carries whichever one the user just saved, so each block below is a
    // no-op when its fields are entirely absent from the body.
    const hasProfileFields = ["name", "phone", "lineId", "taxId", "taxAddress"].some((k) => body[k] !== undefined);
    if (hasProfileFields) {
      await updateHunterProfile(hunterUser.id, {
        name: typeof body.name === "string" ? stripNulBytes(body.name) : undefined,
        phone: typeof body.phone === "string" ? stripNulBytes(body.phone) : undefined,
        lineId: typeof body.lineId === "string" ? stripNulBytes(body.lineId) : undefined,
        taxId: typeof body.taxId === "string" ? stripNulBytes(body.taxId) : undefined,
        taxAddress: typeof body.taxAddress === "string" ? stripNulBytes(body.taxAddress) : undefined,
      });
    }

    if (body.payoutMethod !== undefined) {
      if (!PAYOUT_METHODS.includes(body.payoutMethod)) {
        return NextResponse.json({ error: "ช่องทางรับเงินไม่ถูกต้อง" }, { status: 400 });
      }
      await updateHunterPayout(hunterUser.id, {
        method: body.payoutMethod,
        promptpayId: typeof body.promptpayId === "string" ? stripNulBytes(body.promptpayId) : undefined,
        bankName: typeof body.bankName === "string" ? stripNulBytes(body.bankName) : undefined,
        bankAccountNo: typeof body.bankAccountNo === "string" ? stripNulBytes(body.bankAccountNo) : undefined,
        bankAccountName: typeof body.bankAccountName === "string" ? stripNulBytes(body.bankAccountName) : undefined,
      });
    }

    const updated = await getCurrentHunterUser();
    const { active, created_at, ...settings } = (updated ?? {}) as any;
    return NextResponse.json({ settings });
  } catch (e) {
    console.error("PATCH /api/hunter/settings failed:", e);
    return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });
  }
}
