import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentBusiness } from "@/lib/currentBusiness";
import { isOmiseConfigured, createCustomerWithCard, chargeCustomer } from "@/lib/omise";
import { nextInvoiceNumber } from "@/lib/invoiceNumber";
import { calculateOmiseCardFeeThb, recordSalesCommissionIfApplicable } from "@/lib/salesCommission";

// Binds a card via Omise (create Customer + Card from a one-time Omise.js
// token) and immediately charges it for the selected plan — this is the
// Customer-Initiated Transaction (CIT) that establishes the recurring
// relationship. Every later month's charge is a Merchant-Initiated
// Transaction (MIT) run by scripts/runAutoBilling.ts against the same
// stored customer/card id, with no further action from the customer.
//
// Mirrors app/api/checkout/route.ts's PAYMENT_GATEWAY_ENABLED gate, but
// keyed off isOmiseConfigured() instead of a hardcoded flag — the moment
// OMISE_SECRET_KEY + NEXT_PUBLIC_OMISE_PUBLIC_KEY are set on Render, this
// route (and the checkout UI, see CheckoutForm.tsx) activate on their own,
// no further deploy needed.
export async function POST(req: Request) {
  const business = await getCurrentBusiness();
  if (!business) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!isOmiseConfigured()) {
    return NextResponse.json(
      {
        error:
          "ระบบชำระเงินยังไม่เปิดให้บริการในขณะนี้ กรุณาติดต่อทีมงานเพื่อดำเนินการชำระเงินและเติมเครดิต",
      },
      { status: 503 }
    );
  }

  const { token, consent, planCode, termsAccepted } = await req.json();

  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "ไม่พบข้อมูลบัตร กรุณาลองใหม่อีกครั้ง" }, { status: 400 });
  }
  // Same reasoning as the `consent` check right below — CheckoutForm.tsx's
  // checkbox disabling the pay button is only a UI nicety, a direct POST
  // past the UI could skip it entirely. Checked separately from `consent`
  // because it covers different ground: `consent` is specifically the
  // recurring-auto-billing authorization (card-network MIT rules), while
  // this is acceptance of the general service disclaimer/liability terms
  // (components/DisclaimerBox.tsx, rendered on app/checkout/page.tsx) that
  // every purchase — card or otherwise — requires.
  if (termsAccepted !== true) {
    return NextResponse.json(
      { error: "กรุณายอมรับข้อกำหนดและข้อจำกัดความรับผิดชอบก่อนดำเนินการชำระเงิน" },
      { status: 400 }
    );
  }
  // Consent is enforced server-side, not just a disabled button in the UI —
  // required for card-network MIT rules and Thai consumer-protection rules
  // around recurring billing (see the earlier conversation on this).
  if (consent !== true) {
    return NextResponse.json(
      { error: "กรุณายืนยันความยินยอมให้ตัดเงินอัติก่อนผูกบัตร" },
      { status: 400 }
    );
  }

  const [plan] = (await sql`SELECT * FROM plans WHERE code = ${planCode}`) as any[];
  if (!plan) {
    return NextResponse.json({ error: "invalid plan" }, { status: 400 });
  }

  // FIX (bug audit round 2, high #5): nothing here used to stop two
  // concurrent POSTs for the same business (a network-timeout retry, a
  // double-click before the button's disabled state painted, two open
  // tabs) from both reaching chargeCustomer() below. Since they'd get two
  // DIFFERENT Omise charge ids, the `ON CONFLICT (omise_charge_id)` guard
  // further down (which only catches a retry of the SAME charge, e.g. a
  // webhook redelivery) does nothing to stop it — the customer would be
  // charged twice and granted two packages' worth of credits.
  //
  // Atomically claim a short-lived per-business lock first: this single
  // UPDATE's row lock makes the claim itself race-safe (two concurrent
  // UPDATEs against the same row serialize; the second only sees a "free"
  // lock if the first genuinely never claimed it or the claim has expired),
  // without needing interactive multi-statement transactions, which this
  // app's Neon HTTP driver doesn't support (see lib/credits.ts's comment on
  // reserveCredits for the same constraint). The 2-minute staleness window
  // means a crash between claiming and releasing the lock (e.g. the process
  // dying mid-request) can't permanently lock a business out of ever
  // checking out again.
  const CHECKOUT_LOCK_MINUTES = 2;
  const [lockClaimed] = (await sql`
    UPDATE businesses
    SET checkout_in_progress_at = now()
    WHERE id = ${business.id}
      AND (checkout_in_progress_at IS NULL
        OR checkout_in_progress_at < now() - make_interval(mins => ${CHECKOUT_LOCK_MINUTES}))
    RETURNING id
  `) as any[];
  if (!lockClaimed) {
    return NextResponse.json(
      { error: "กำลังดำเนินการชำระเงินอยู่ กรุณารอสักครู่แล้วลองใหม่อีกครั้ง" },
      { status: 409 }
    );
  }

  try {
    let bound;
    try {
      bound = await createCustomerWithCard(token, business.contact_email ?? undefined);
    } catch (err: any) {
      return NextResponse.json(
        { error: err?.message || "ไม่สามารถบันทึกบัตรได้ กรุณาตรวจสอบข้อมูลบัตรอีกครั้ง" },
        { status: 400 }
      );
    }

    // One saved card per business for now — replace any previous default
    // rather than accumulating unused rows every time someone re-checks out.
    await sql`UPDATE payment_methods SET is_default = false WHERE business_id = ${business.id}`;
    await sql`
      INSERT INTO payment_methods
        (business_id, brand, last4, exp_month, exp_year, is_default, omise_customer_id, omise_card_id)
      VALUES
        (${business.id}, ${bound.brand}, ${bound.last4}, ${bound.expMonth}, ${bound.expYear}, true, ${bound.omiseCustomerId}, ${bound.omiseCardId})
    `;

    const chargeResult = await chargeCustomer(bound.omiseCustomerId, bound.omiseCardId, Number(plan.price_thb), {
      description: `AdCheck ${plan.name} — ${business.name}`,
      indicator: "CIT",
      metadata: { business_id: business.id, plan_id: plan.id },
    });

    // Some Thai-issued cards require a 3-D Secure step-up on this first
    // charge. The card is already bound above, so nothing is lost if the
    // customer abandons the bank's auth page — they can just retry the
    // charge. Final confirmation (and credit-granting) happens in
    // app/api/webhooks/omise/route.ts once Omise reports the real outcome.
    if (chargeResult.pending3ds) {
      return NextResponse.json({
        ok: false,
        requires3ds: true,
        authorizeUri: chargeResult.pending3ds,
      });
    }

    if (!chargeResult.success) {
      return NextResponse.json(
        { error: chargeResult.failureMessage || "การตัดบัตรไม่สำเร็จ กรุณาตรวจสอบวงเงินหรือใช้บัตอื่น" },
        { status: 402 }
      );
    }

    // FIX (bug audit round 3, high — confirmed live): a random 4-digit
    // suffix into a UNIQUE column, with no retry logic, right after a real
    // charge has already succeeded — see lib/invoiceNumber.ts for the full
    // writeup. A collision here used to mean the customer's card was
    // already billed but this INSERT (and every step after it, including
    // granting credits) throws instead of completing.
    const invoiceNumber = await nextInvoiceNumber();
    const amountThb = Number(plan.price_thb);
    const feeThb = calculateOmiseCardFeeThb(amountThb);
    const netThb = Math.round((amountThb - feeThb) * 100) / 100;
    const [transaction] = (await sql`
      INSERT INTO transactions (business_id, plan_id, amount_thb, fee_thb, net_thb, channel, status, invoice_number, omise_charge_id)
      VALUES (${business.id}, ${plan.id}, ${amountThb}, ${feeThb}, ${netThb}, 'บัตรเครดิต/เดบิต', 'สำเร็จ', ${invoiceNumber}, ${chargeResult.chargeId})
      ON CONFLICT (omise_charge_id) DO NOTHING
      RETURNING id
    `) as any[];

    // ON CONFLICT DO NOTHING means a webhook retry (or a rare double-submit)
    // for the exact same charge id already recorded this — nothing left to
    // grant a second time.
    if (!transaction) {
      return NextResponse.json({ ok: true, invoiceNumber });
    }

    // Sales Commission (2026-09-01): no-op unless this business signed up
    // through a sales rep's referral link — see lib/salesCommission.ts.
    await recordSalesCommissionIfApplicable(transaction.id, business.id, amountThb);

    await sql`
      INSERT INTO business_packages (business_id, plan_id, transaction_id, credits_granted, credits_remaining, purchased_at, expires_at)
      VALUES (${business.id}, ${plan.id}, ${transaction.id}, ${plan.monthly_image_credits}, ${plan.monthly_image_credits}, now(), now() + interval '30 days')
    `;

    await sql`
      UPDATE businesses
      SET plan_id = ${plan.id}, credits_reset_at = now() + interval '30 days', updated_at = now(),
          auto_renew_enabled = true, billing_retry_count = 0
      WHERE id = ${business.id}
    `;

    return NextResponse.json({ ok: true, invoiceNumber });
  } finally {
    // Always release the lock, on every exit path (success, a card/charge
    // failure, or an unexpected throw) — otherwise a legitimate later
    // checkout attempt would be blocked for the rest of the 2-minute window
    // for no reason.
    await sql`UPDATE businesses SET checkout_in_progress_at = NULL WHERE id = ${business.id}`;
  }
}
