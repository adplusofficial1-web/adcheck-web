export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { getPlans } from "@/lib/db";
import { getCurrentBusiness } from "@/lib/currentBusiness";
import { isOmiseConfigured } from "@/lib/omise";
import { isQrPaymentMode } from "@/lib/paymentMode";
import { buildPromptPayQrPayload } from "@/lib/promptpay";
import { COMPANY_BANK_ACCOUNT } from "@/lib/companyBankAccount";
import { getPendingManualPaymentForBusiness } from "@/lib/qrPayments";
import { Nav } from "@/components/Nav";
import { DisclaimerBox } from "@/components/DisclaimerBox";
import { CheckoutForm } from "./CheckoutForm";
import { QrCheckoutForm } from "./QrCheckoutForm";

// There is no per-clinic checkout any more — every purchase here (whether
// it's a solo clinic's own package or an agency's shared code='agency'
// package) always bills the signed-in business itself. A child clinic has
// no login of its own and no package of its own to buy; every review it
// runs draws from its managing agency's pool instead (see
// lib/agency.ts:hasActiveAgencyPlan and app/api/submissions/route.ts).
export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: { plan?: string };
}) {
  const plans = await getPlans();
  const plan = plans.find((p: any) => p.code === (searchParams.plan || "standard")) || plans[1];
  const business = await getCurrentBusiness();
  if (!business) {
    redirect("/login");
  }

  const amount = Number(plan.price_thb);

  // PAYMENT_MODE (2569-09-03, lib/paymentMode.ts): interim manual QR
  // PromptPay / bank-transfer flow while ADCheck's own Omise merchant
  // account is still pending approval. Set PAYMENT_MODE=omise on Render
  // once it's approved to flip straight back to the card/Omise checkout
  // below — nothing about that path is touched by this branch.
  if (isQrPaymentMode()) {
    const qrPayload = buildPromptPayQrPayload(COMPANY_BANK_ACCOUNT.promptPayTaxId, amount);
    const qrDataUrl = await QRCode.toDataURL(qrPayload, { margin: 1, width: 288 });
    const pending = await getPendingManualPaymentForBusiness(business.id, plan.id);

    return (
      <main>
        <Nav credits={business?.credits_remaining} />
        <div className="max-w-lg mx-auto px-6 py-14">
          <h1 className="text-2xl font-medium mb-2">ยืนยันการชำระเงิน</h1>
          <div className="bg-accentSoft rounded-lg p-4 flex items-center justify-between gap-4 mb-8 mt-4">
            <div className="min-w-0">
              <div className="font-medium">
                แพ็ก{plan.name} — {plan.monthly_image_credits} ครั้ง
              </div>
              <div className="text-xs text-secondary">เครดิตจำนวนนี้จะถูกเพิ่มเข้าไป (ไม่ได้แทนที่ยอดเดิม) พร้อมรอบใช้งาน 30 วันนับจากวันที่ทีมงานอนุมัติ</div>
            </div>
            <div className="flex items-baseline gap-1 flex-shrink-0 whitespace-nowrap">
              <span className="text-2xl font-semibold tabular-nums">{amount.toLocaleString("th-TH")}</span>
              <span className="text-sm text-secondary">บาท</span>
            </div>
          </div>

          <QrCheckoutForm
            planCode={plan.code}
            planName={plan.name}
            amount={amount}
            qrDataUrl={qrDataUrl}
            bankAccount={COMPANY_BANK_ACCOUNT}
            pending={
              pending
                ? { invoiceNumber: pending.invoice_number, createdAt: pending.created_at }
                : null
            }
          />

          {/* CHANGE (2569-09-04, per user request): moved from above
              QrCheckoutForm to the very bottom of the page — QrCheckoutForm's
              own "ฉันได้อ่านและยอมรับ...ด้านล่าง" checkbox now points down to
              this box instead of up to it. */}
          {!pending && <DisclaimerBox className="mt-6" />}
        </div>
      </main>
    );
  }

  // isOmiseConfigured() only checks env vars are present — it never touches
  // the secret key value itself, so it's safe to read in a server component
  // and pass the boolean (not the key) down. The public key IS safe to pass
  // to the client — that's its entire purpose, see CheckoutForm.tsx.
  const paymentEnabled = isOmiseConfigured();
  const omisePublicKey = process.env.NEXT_PUBLIC_OMISE_PUBLIC_KEY;

  return (
    <main>
      <Nav credits={business?.credits_remaining} />
      <div className="max-w-lg mx-auto px-6 py-14">
        <h1 className="text-2xl font-medium mb-2">ยืนยันการชำระเงิน</h1>
        <div className="bg-accentSoft rounded-lg p-4 flex items-center justify-between gap-4 mb-8 mt-4">
          <div className="min-w-0">
            <div className="font-medium">
              แพ็ก{plan.name} — {plan.monthly_image_credits} ครั้ง
            </div>
            {/* FIX (bug audit — Low: checkout copy vs. actual behavior):
                this used to say credits are "set to" this amount — but
                app/api/checkout/route.ts INSERTs a new, independent
                30-day business_packages row alongside any already-active
                package(s), it never overwrites/resets the existing
                balance (see lib/credits.ts). Worded to match. */}
            <div className="text-xs text-secondary">เครดิตจำนวนนี้จะถูกเพิ่มเข้าไป (ไม่ได้แทนที่ยอดเดิม) พร้อมรอบใช้งาน 30 วันนับจากวันนี้</div>
          </div>
          {/* Number and unit sized/weighted separately (rather than one
              plain string) so the price reads as a price — a bold amount
              with a small currency label — and `flex-shrink-0 whitespace-
              nowrap` keeps "บาท" from wrapping onto its own line on
              narrow screens, which used to happen when this was a single
              text-xl string competing for space with the text block above. */}
          <div className="flex items-baseline gap-1 flex-shrink-0 whitespace-nowrap">
            <span className="text-2xl font-semibold tabular-nums">
              {amount.toLocaleString()}
            </span>
            <span className="text-sm text-secondary">บาท</span>
          </div>
        </div>
        {/* Payment gateway isn't connected yet — warn before the user picks
            a channel and fills anything in, instead of only surfacing the
            failure after they hit "ชำระเงิน" (C2). Once OMISE_SECRET_KEY +
            NEXT_PUBLIC_OMISE_PUBLIC_KEY are set on Render, paymentEnabled
            flips to true on its own and this banner disappears — no code
            change needed at that point. */}
        {!paymentEnabled && (
          <div className="bg-warningSoft text-warning rounded-lg p-4 mb-6 text-sm">
            ระบบชำระเงินออนไลน์ยังไม่เปิดให้บริการในขณะนี้ กรุณาติดต่อทีมงานเพื่อเติมเครดิตด้วยตนเองก่อน
          </div>
        )}
        <CheckoutForm
          planCode={plan.code}
          amount={amount}
          paymentEnabled={paymentEnabled}
          omisePublicKey={omisePublicKey}
        />

        {/* CHANGE (2569-09-04, per user request): moved from above
            CheckoutForm to the very bottom of the page — reading the full
            terms still happens before submission is possible (the "I have
            read and accept" checkbox inside CheckoutForm still blocks
            payment client- and server-side, see app/api/billing/card/route.ts
            and app/api/checkout/route.ts), it's just no longer positioned
            above the form. CheckoutForm.tsx's checkbox copy now points down
            ("...ด้านล่าง") to this box instead of up. */}
        <DisclaimerBox className="mt-6" />
      </div>
    </main>
  );
}
