import { NextResponse } from "next/server";
import { getCurrentHunterUser } from "@/lib/currentHunterUser";
import { updateHunterProfile, updateHunterPayout, type HunterPayoutMethod } from "@/lib/hunterUsers";
import { stripNulBytes } from "@/lib/validation";
import { validateAvatarDataUrl } from "@/lib/uploadLimits";

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

// Bug Audit 4 (2569-09-02): per-field length caps. Every column here is
// unbounded TEXT (migrations/014) and the form is open to any self-
// registered Google account, so without these a single PATCH could store
// megabytes into hunter_users, and the name (shown in the admin roster,
// payout queue, and header) can't be blank. Generous limits — nothing
// legitimate comes close.
const LIMITS = {
  name: 120,
  phone: 30,
  lineId: 60,
  taxId: 20,
  taxAddress: 500,
  bank: 120,
} as const;

// Returns the cleaned string, undefined when the field wasn't sent, or a
// Thai error message when it's too long.
function cleanField(raw: unknown, max: number, label: string): string | undefined | { error: string } {
  if (typeof raw !== "string") return undefined;
  const value = stripNulBytes(raw).trim();
  if (value.length > max) return { error: `${label}ต้องไม่เกิน ${max} ตัวอักษร` };
  return value;
}

function isFieldError(v: unknown): v is { error: string } {
  return typeof v === "object" && v !== null && "error" in v;
}

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
    const hasProfileFields = ["name", "phone", "lineId", "taxId", "taxAddress", "avatarBase64"].some(
      (k) => body[k] !== undefined
    );
    if (hasProfileFields) {
      // Profile picture (2569-09-01): same data: URL convention + limits as
      // the clinic account's avatar (app/api/settings/profile/route.ts) —
      // reusing validateAvatarDataUrl rather than inventing separate rules.
      let avatarUrl: string | undefined;
      if (typeof body.avatarBase64 === "string" && body.avatarBase64.startsWith("data:")) {
        const avatarError = validateAvatarDataUrl(body.avatarBase64);
        if (avatarError) {
          return NextResponse.json({ error: avatarError }, { status: 400 });
        }
        avatarUrl = body.avatarBase64;
      }

      const fields = {
        name: cleanField(body.name, LIMITS.name, "ชื่อ"),
        phone: cleanField(body.phone, LIMITS.phone, "เบอร์โทรศัพท์"),
        lineId: cleanField(body.lineId, LIMITS.lineId, "LINE ID"),
        taxId: cleanField(body.taxId, LIMITS.taxId, "เลขประจำตัวผู้เสียภาษี"),
        taxAddress: cleanField(body.taxAddress, LIMITS.taxAddress, "ที่อยู่สำหรับออกเอกสาร"),
      };
      for (const v of Object.values(fields)) {
        if (isFieldError(v)) return NextResponse.json({ error: v.error }, { status: 400 });
      }
      // Only reject an empty name when the field was actually sent — a
      // payout-only or avatar-only save doesn't carry it at all.
      if (fields.name === "") {
        return NextResponse.json({ error: "กรุณาระบุชื่อ" }, { status: 400 });
      }

      await updateHunterProfile(hunterUser.id, {
        name: fields.name as string | undefined,
        phone: fields.phone as string | undefined,
        lineId: fields.lineId as string | undefined,
        taxId: fields.taxId as string | undefined,
        taxAddress: fields.taxAddress as string | undefined,
        avatarUrl,
      });
    }

    if (body.payoutMethod !== undefined) {
      if (!PAYOUT_METHODS.includes(body.payoutMethod)) {
        return NextResponse.json({ error: "ช่องทางรับเงินไม่ถูกต้อง" }, { status: 400 });
      }
      const payout = {
        promptpayId: cleanField(body.promptpayId, LIMITS.bank, "หมายเลข PromptPay"),
        bankName: cleanField(body.bankName, LIMITS.bank, "ชื่อธนาคาร"),
        bankAccountNo: cleanField(body.bankAccountNo, LIMITS.bank, "เลขที่บัญชี"),
        bankAccountName: cleanField(body.bankAccountName, LIMITS.bank, "ชื่อบัญชี"),
      };
      for (const v of Object.values(payout)) {
        if (isFieldError(v)) return NextResponse.json({ error: v.error }, { status: 400 });
      }
      await updateHunterPayout(hunterUser.id, {
        method: body.payoutMethod,
        promptpayId: payout.promptpayId as string | undefined,
        bankName: payout.bankName as string | undefined,
        bankAccountNo: payout.bankAccountNo as string | undefined,
        bankAccountName: payout.bankAccountName as string | undefined,
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
