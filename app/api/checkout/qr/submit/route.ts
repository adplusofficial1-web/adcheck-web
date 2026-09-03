import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentBusiness } from "@/lib/currentBusiness";
import { createManualPaymentRequest, getPendingManualPaymentForBusiness } from "@/lib/qrPayments";

// POST /api/checkout/qr/submit — the manual QR/bank-transfer counterpart of
// app/api/billing/card/route.ts and app/api/checkout/route.ts, used while
// PAYMENT_MODE isn't "omise" (see lib/paymentMode.ts). Unlike those two,
// this never grants credits itself — it only files a
// manual_payment_requests row (status='pending') for an AD Plus admin to
// review (app/admin/manual-payments, app/api/admin/manual-payments/**).
// Credits are granted exactly once, only on admin approval, in
// lib/qrPayments.ts:approveManualPaymentRequest.
const MAX_SLIP_BYTES = 8 * 1024 * 1024; // 8MB — mirrors the client-side limit in QrCheckoutForm.tsx; enforced again here since a disabled/validated file input is only a UI nicety.
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export async function POST(req: Request) {
  const business = await getCurrentBusiness();
  if (!business) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const form = await req.formData();
    const planCode = form.get("planCode");
    const termsAccepted = form.get("termsAccepted");
    const slip = form.get("slip");

    // Required for every channel — same server-side enforcement as
    // app/api/checkout/route.ts and app/api/billing/card/route.ts; a
    // disabled submit button in QrCheckoutForm.tsx is only a UI nicety.
    if (termsAccepted !== "true") {
      return NextResponse.json(
        { error: "กรุณายอมรับข้อกำหนดและข้อจำกัดความรับผิดชอบก่อนดำเนินการชำระเงิน" },
        { status: 400 }
      );
    }
    if (typeof planCode !== "string" || !planCode) {
      return NextResponse.json({ error: "invalid plan" }, { status: 400 });
    }
    if (!(slip instanceof File)) {
      return NextResponse.json({ error: "กรุณาแนบสลิปการโอนเงิน" }, { status: 400 });
    }
    if (!ACCEPTED_TYPES.has(slip.type)) {
      return NextResponse.json({ error: "รองรับเฉพาะไฟล์รูปภาพ (JPG/PNG/WEBP) หรือ PDF เท่านั้น" }, { status: 400 });
    }
    if (slip.size > MAX_SLIP_BYTES) {
      return NextResponse.json({ error: "ไฟล์ใหญ่เกินไป (จำกัด 8MB)" }, { status: 400 });
    }

    const [plan] = (await sql`SELECT * FROM plans WHERE code = ${planCode}`) as any[];
    if (!plan) {
      return NextResponse.json({ error: "invalid plan" }, { status: 400 });
    }

    // Idempotent-ish: a business re-submitting on the same plan while an
    // earlier request is still awaiting review (e.g. a retried request
    // after a network hiccup, or just re-opening /checkout) gets back the
    // existing pending request's invoice number instead of filing a second,
    // duplicate row for the admin queue.
    const existingPending = await getPendingManualPaymentForBusiness(business.id, plan.id);
    if (existingPending) {
      return NextResponse.json({ ok: true, invoiceNumber: existingPending.invoice_number });
    }

    const buffer = Buffer.from(await slip.arrayBuffer());
    const slipBase64 = buffer.toString("base64");

    const { invoiceNumber } = await createManualPaymentRequest({
      businessId: business.id,
      planId: plan.id,
      amountThb: Number(plan.price_thb),
      slipBase64,
      slipMediaType: slip.type,
    });

    return NextResponse.json({ ok: true, invoiceNumber });
  } catch (e: any) {
    console.error("POST /api/checkout/qr/submit failed:", e);
    return NextResponse.json({ error: "ส่งสลิปไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }
}
