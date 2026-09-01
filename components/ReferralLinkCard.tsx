"use client";

import { useState } from "react";

// Small, purely-presentational "copy my referral link" card — used by both
// app/hunter/page.tsx and app/sales/page.tsx (Hunter Commission /
// Sales Commission, 2026-09-01: added to both together per the user's
// request so neither role needs a manual database lookup to find their own
// id). Deliberately shared rather than mirrored like the data-access layers
// elsewhere in this codebase (lib/hunterUsers.ts vs lib/salesLeads.ts,
// etc.) — those mirror because they encode different business rules per
// role; this component has none, it just displays a string and copies it.
export function ReferralLinkCard({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can throw (insecure context, denied permission) —
      // the link is still visible and selectable as plain text, so this
      // fails silently rather than showing an alert for a non-critical
      // convenience feature.
    }
  };

  return (
    <div className="mt-6 rounded-lg border border-border bg-surface px-4 py-3">
      <p className="text-xs text-secondary mb-1.5">
        ลิงก์ชวนสมัครของคุณ — ลูกค้าที่สมัครผ่านลิงก์นี้จะนับค่าคอมมิชชั่นให้คุณโดยอัตโนมัติ ไม่มีวันหมดอายุ
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <code className="text-xs bg-page border border-border rounded px-2 py-1 break-all">{link}</code>
        <button
          type="button"
          onClick={copy}
          className="rounded-md bg-inverse text-onInverse px-3 py-1.5 text-xs font-medium whitespace-nowrap"
        >
          {copied ? "คัดลอกแล้ว ✓" : "คัดลอกลิงก์"}
        </button>
      </div>
    </div>
  );
}
