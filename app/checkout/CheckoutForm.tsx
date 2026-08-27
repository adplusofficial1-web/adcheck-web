"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DbdTrustBadge } from "@/components/DbdTrustBadge";

const CHANNELS = ["บัตรเครดิต/เดบิต", "QR PromptPay", "Mobile Banking", "Direct Debit"];

// Mirrors PAYMENT_GATEWAY_ENABLED in app/api/checkout/route.ts — that route
// already rejects every charge, but leaving the button looking clickable
// meant someone had to pick a channel and hit "ชำระเงิน" just to find out
// (C2). Flip both together once a real gateway is wired up; until then the
// button stays disabled and says so up front instead of failing silently.
const PAYMENT_ENABLED = false;

export function CheckoutForm({
  planCode,
  amount,
}: {
  planCode: string;
  amount: number;
}) {
  const router = useRouter();
  const [channel, setChannel] = useState(CHANNELS[1]);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planCode, channel }),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok) {
      setDone(data.invoiceNumber);
      // Buying the agency package lands back on the Agency dashboard
      // (where the shared credit pool and per-clinic upload buttons live);
      // any other plan is a solo clinic's own package, so back to /dashboard.
      setTimeout(() => router.push(planCode === "agency" ? "/agency/dashboard" : "/dashboard"), 1500);
    } else {
      // Payment gateway isn't connected yet (see app/api/checkout/route.ts)
      // — every attempt fails here on purpose, and no credit is granted.
      // Surface the real reason instead of leaving the button just reset
      // with no feedback, which read as a silent do-nothing before this.
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
      <div className="text-sm font-medium mb-3">เลือกวิธีการชำระเงิน</div>
      <div className="grid grid-cols-2 gap-2 mb-8">
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

      {error && <div className="text-sm text-danger mb-4">{error}</div>}

      <button
        onClick={pay}
        disabled={loading || !PAYMENT_ENABLED}
        className="w-full rounded-md bg-inverse text-onInverse py-3 text-sm font-medium disabled:opacity-50"
      >
        {loading
          ? "กำลังดำเนินการ..."
          : !PAYMENT_ENABLED
          ? "ระบบชำระเงินยังไม่เปิดให้บริการ"
          : `ชำระเงิน ${amount.toLocaleString()} บาท`}
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
