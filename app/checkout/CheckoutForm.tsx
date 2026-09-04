"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Script from "next/script";
import { DbdTrustBadge } from "@/components/DbdTrustBadge";

const CHANNELS = ["บัตรเครดิต/เดบิต", "QR PromptPay", "Mobile Banking", "Direct Debit"];

declare global {
  interface Window {
    Omise?: {
      setPublicKey: (key: string) => void;
      createToken: (
        type: "card",
        card: {
          name: string;
          number: string;
          expiration_month: string;
          expiration_year: string;
          security_code: string;
        },
        cb: (statusCode: number, response: any) => void
      ) => void;
    };
  }
}

export function CheckoutForm({
  planCode,
  amount,
  paymentEnabled,
  omisePublicKey,
}: {
  planCode: string;
  amount: number;
  // True only once OMISE_SECRET_KEY + NEXT_PUBLIC_OMISE_PUBLIC_KEY are both
  // set (see lib/omise.ts:isOmiseConfigured, checked server-side in
  // app/checkout/page.tsx) — everything below degrades to the old "ยังไม่
  // เปิดให้บริการ" disabled-button behavior until then.
  paymentEnabled: boolean;
  omisePublicKey?: string;
}) {
  const router = useRouter();
  // FIX (bug audit #9): the post-payment redirect used to key off
  // `planCode === "agency"` — the PACKAGE someone bought, not the MODE they
  // were checking out from. An agency buying a non-agency package (or a
  // solo clinic somehow reaching the agency package) landed on the wrong
  // dashboard. usePathname() reflects where this checkout actually started
  // (/agency/checkout vs /checkout — see app/agency/checkout/page.tsx and
  // app/checkout/page.tsx), which is what should decide where "done" sends
  // them back to. Same pattern as components/ProcessingScreen.tsx.
  const pathname = usePathname();
  const isAgencyCheckout = pathname?.startsWith("/agency") ?? false;
  const [channel, setChannel] = useState(CHANNELS[0]);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [omiseReady, setOmiseReady] = useState(false);

  const [cardName, setCardName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [expMonth, setExpMonth] = useState("");
  const [expYear, setExpYear] = useState("");
  const [cvv, setCvv] = useState("");
  const [consent, setConsent] = useState(false);
  // Acceptance of components/DisclaimerBox.tsx — CHANGE (2569-09-04, per
  // user request): that box now renders BELOW this form (at the very
  // bottom of app/checkout/page.tsx) instead of above it, so the checkbox
  // copy below says "ด้านล่าง" (below), not "ข้างต้น" (above). Required for
  // EVERY channel (unlike `consent`, which is only the recurring-auto-
  // billing authorization and only applies to the card channel) —
  // enforced here for the button state and again server-side in both
  // app/api/billing/card/route.ts and app/api/checkout/route.ts, since a
  // disabled button is only a UI nicety.
  const [termsAccepted, setTermsAccepted] = useState(false);

  const isCardChannel = channel === CHANNELS[0];
  // Only the card channel is wired to a real gateway in this pass — QR
  // PromptPay / Mobile Banking / Direct Debit are separate integrations,
  // still intentionally disabled (see app/api/checkout/route.ts).
  const cardChannelEnabled = paymentEnabled && Boolean(omisePublicKey);

  function createOmiseToken(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!window.Omise || !omisePublicKey) {
        reject(new Error("ไม่สามารถโหลดระบบชำระเงินได้ กรุณาลองรีเฟรชหน้านี้แล้วลองใหม่"));
        return;
      }
      window.Omise.setPublicKey(omisePublicKey);
      window.Omise.createToken(
        "card",
        {
          name: cardName,
          number: cardNumber.replace(/\s+/g, ""),
          expiration_month: expMonth,
          expiration_year: expYear,
          security_code: cvv,
        },
        (_statusCode, response) => {
          if (response?.object === "error") {
            reject(new Error(response.message || "ข้อมูลบัตรไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง"));
          } else {
            resolve(response.id);
          }
        }
      );
    });
  }

  async function payWithCard() {
    if (!termsAccepted) {
      setError("กรุณายอมรับข้อกำหนดและข้อจำกัดความรับผิดชอบก่อนดำเนินการชำระเงิน");
      return;
    }
    if (!consent) {
      setError("กรุณายืนยันความยินยอมให้ตัดเงินอัตโนมัติก่อนดำเนินการ");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const token = await createOmiseToken();
      const res = await fetch("/api/billing/card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, consent: true, planCode, termsAccepted: true }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setDone(data.invoiceNumber);
        setTimeout(() => router.push(isAgencyCheckout ? "/agency/dashboard" : "/dashboard"), 1500);
      } else if (data.requires3ds && data.authorizeUri) {
        // Bank requires 3-D Secure step-up — hand off to the bank's own
        // page. It redirects back once done; the webhook
        // (app/api/webhooks/omise/route.ts) finalizes credits from there,
        // so this tab doesn't need to do anything more.
        window.location.href = data.authorizeUri;
        return;
      } else {
        setError(data.error || "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
        setLoading(false);
      }
    } catch (err: any) {
      setError(err?.message || "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
      setLoading(false);
    }
  }

  async function payOther() {
    if (!termsAccepted) {
      setError("กรุณายอมรับข้อกำหนดและข้อจำกัดความรับผิดชอบก่อนดำเนินการชำระเงิน");
      return;
    }
    setLoading(true);
    setError(null);
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planCode, channel, termsAccepted: true }),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok) {
      setDone(data.invoiceNumber);
      setTimeout(() => router.push(isAgencyCheckout ? "/agency/dashboard" : "/dashboard"), 1500);
    } else {
      setError(data.error || "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
    }
  }

  if (done) {
    return (
      <div className="text-center py-10">
        <div className="text-lg font-medium mb-2">ชำระเงินสำเร็จ</div>
        <div className="text-sm text-secondary">เลขที่ใบกำกับภาษี {done} — กำลังพาไปหน้าแดชบอร์ด...</div>
      </div>
    );
  }

  return (
    <div>
      {cardChannelEnabled && (
        <Script
          src="https://cdn.omise.co/omise.js"
          strategy="afterInteractive"
          onLoad={() => setOmiseReady(true)}
        />
      )}

      <div className="text-sm font-medium mb-3">เลือกวิธีการชำระเงิน</div>
      <div className="grid grid-cols-2 gap-2 mb-6">
        {CHANNELS.map((c) => (
          <button
            key={c}
            onClick={() => setChannel(c)}
            className={`rounded-md border px-3 py-3 text-sm ${
              channel === c ? "border-accent" : "border-border"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {isCardChannel && cardChannelEnabled && (
        <div className="space-y-3 mb-2">
          <input
            className="w-full rounded-md border border-border px-3 py-2.5 text-sm"
            placeholder="ชื่อบนบัตร"
            value={cardName}
            onChange={(e) => setCardName(e.target.value)}
          />
          <input
            className="w-full rounded-md border border-border px-3 py-2.5 text-sm"
            placeholder="หมายเลขบัตร"
            inputMode="numeric"
            value={cardNumber}
            onChange={(e) => setCardNumber(e.target.value)}
          />
          <div className="grid grid-cols-3 gap-2">
            <input
              className="rounded-md border border-border px-3 py-2.5 text-sm"
              placeholder="เดือนหมดอายุ (MM)"
              inputMode="numeric"
              value={expMonth}
              onChange={(e) => setExpMonth(e.target.value)}
            />
            <input
              className="rounded-md border border-border px-3 py-2.5 text-sm"
              placeholder="ปีหมดอายุ (YYYY)"
              inputMode="numeric"
              value={expYear}
              onChange={(e) => setExpYear(e.target.value)}
            />
            <input
              className="rounded-md border border-border px-3 py-2.5 text-sm"
              placeholder="CVV"
              inputMode="numeric"
              value={cvv}
              onChange={(e) => setCvv(e.target.value)}
            />
          </div>
          <label className="flex items-start gap-2 text-xs text-secondary pt-2">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5"
            />
            {/* FIX (bug audit round 3, minor/preventive): amount.toLocaleString()
                with no locale argument resolves the default locale of
                whichever runtime calls it — this "use client" component
                renders once on the server and again during hydration, and
                those two runtimes can in principle resolve a different
                default locale. Pinning "th-TH" explicitly (matching every
                other formatted number on this page) removes the ambiguity
                outright, same defensive reasoning as the timeZone fixes
                elsewhere in this round. */}
            <span>
              ยินยอมให้ตัดเงินบัตรนี้อัตโนมัติทุกรอบ 30 วัน ({amount.toLocaleString("th-TH")} บาท/รอบ)
              ไม่ว่าจะใช้เครดิตครบหรือไม่ จนกว่าจะยกเลิกในหน้าตั้งค่า
            </span>
          </label>
        </div>
      )}

      {/* Required for every channel, not just the card one — see the
          termsAccepted comment near its useState above. components/
          DisclaimerBox.tsx now renders below this form, at the very
          bottom of app/checkout/page.tsx (CHANGE 2569-09-04) — copy says
          "ด้านล่าง" (below) to match. */}
      <label className="flex items-start gap-2 text-xs text-secondary pt-1 pb-3">
        <input
          type="checkbox"
          checked={termsAccepted}
          onChange={(e) => setTermsAccepted(e.target.checked)}
          className="mt-0.5"
        />
        <span>ฉันได้อ่านและยอมรับข้อกำหนดและข้อจำกัดความรับผิดชอบด้านล่างแล้ว</span>
      </label>

      {error && <div className="text-sm text-danger mb-4 mt-3">{error}</div>}

      <button
        onClick={isCardChannel ? payWithCard : payOther}
        disabled={
          loading ||
          !termsAccepted ||
          (isCardChannel ? !cardChannelEnabled || !omiseReady : !paymentEnabled)
        }
        className="w-full rounded-md bg-inverse text-onInverse py-3 text-sm font-medium disabled:opacity-50 mt-4"
      >
        {loading
          ? "กำลังดำเนินการ..."
          : isCardChannel && !cardChannelEnabled
          ? "ระบบชำระเงินยังไม่เปิดให้บริการ"
          : !isCardChannel && !paymentEnabled
          ? "ระบบชำระเงินยังไม่เปิดให้บริการ"
          : `ชำระเงิน ${amount.toLocaleString("th-TH")} บาท`}
      </button>

      {/* Trust signal right at the payment decision point — see
          components/DbdTrustBadge.tsx for why this placement matters. */}
      <div className="flex items-center justify-center gap-3 mt-4 text-xs text-tertiary">
        <span>🔒 ชำระเงินปลอดภัย</span>
        <span className="w-px h-4 bg-border" />
        <DbdTrustBadge variant="compact" />
      </div>
    </div>
  );
}
