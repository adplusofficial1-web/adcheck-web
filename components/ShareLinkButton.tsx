"use client";

import { useState } from "react";

/**
 * Copies a public, no-login-required link to this submission's results
 * (`/share/[token]` — see app/share/[token]/page.tsx) built from the
 * share_token the DB already generates for every submission (unique text
 * column, unique-indexed as submissions_share_token_key — see the
 * submissions table). Unlike this page's own URL (`/results/[id]`), which
 * redirects anyone without the exact same Google account to /login, the
 * share link works for anyone who has it — a colleague, a printer, a
 * สบส. inspector — no account required. That's also why the button warns
 * on every copy: it's a capability grant, not just a bookmark.
 */
export function ShareLinkButton({ shareToken }: { shareToken: string }) {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    const url = `${window.location.origin}/share/${shareToken}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard API needs a secure-context permission that isn't always
      // granted (older browsers, some in-app webviews) — fall back to the
      // classic hidden-textarea + execCommand trick instead of doing
      // nothing.
      const textarea = document.createElement("textarea");
      textarea.value = url;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
      } catch {
        // Truly nothing left to try — skip the "copied" claim below so the
        // person isn't told it worked when it didn't.
        document.body.removeChild(textarea);
        return;
      }
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={handleClick}
        className="rounded-md border border-border px-4 py-2 text-sm"
      >
        {copied ? "คัดลอกแล้ว ✓" : "แชร์ลิงก์"}
      </button>
      {copied && (
        <div className="absolute left-0 top-full mt-1.5 w-64 text-xs text-secondary">
          คัดลอกลิงก์แล้ว — ใครก็ตามที่มีลิงก์นี้จะเปิดดูผลตรวจสอบนี้ได้โดยไม่ต้องเข้าสู่ระบบ
          ส่งต่อเฉพาะคนที่ควรเห็นเท่านั้น
        </div>
      )}
    </div>
  );
}
