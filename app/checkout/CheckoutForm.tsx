"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const CHANNELS = ["บัตรเครดิต/เดบิต", "QR PromptPay", "Mobile Banking", "Direct Debit"];

export function CheckoutForm({
  planCode,
  amount,
  businessId,
}: {
  planCode: string;
  amount: number;
  // Present only when an Agency account is paying for one of its child
  // clinics (see app/checkout/page.tsx) — forwarded to the API so it bills
  // that clinic's business row instead of the signed-in account's own.
  businessId?: string;
}) {
  const router = useRouter();
  const [channel, setChannel] = useState(CHANNELS[1]);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function pay() {
    setLoading(true);
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planCode, channel, businessId }),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok) {
      setDone(data.invoiceNumber);
      setTimeout(() => router.push(businessId ? "/agency/settings" : "/dashboard"), 1500);
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
      <button
        onClick={pay}
        disabled={loading}
        className="w-full rounded-md bg-inverse text-onInverse py-3 text-sm font-medium disabled:opacity-50"
      >
        {loading ? "กำลังดำเนินการ..." : `ชำระเงิน ${amount.toLocaleString()} บาท`}
      </button>
    </div>
  );
}
