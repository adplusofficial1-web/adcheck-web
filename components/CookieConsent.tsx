"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

// Same Measurement ID the team already wired up directly in app/layout.tsx
// (commit 279a7c9, 2026-09-04) — moved here so GA4 only ever loads after
// the visitor actively consents, instead of firing unconditionally on
// every page load. Nothing else about the tracking setup changes.
const GA_MEASUREMENT_ID = "G-0PXYV4TRYW";
const CONSENT_KEY = "adcheck_analytics_consent"; // "granted" | "denied"

// PDPA requires a real choice, not just a notice — this only loads GA4
// after the visitor clicks "ยอมรับ", never before, and remembers "ปฏิเสธ"
// so the banner doesn't nag a visitor who already declined. If
// localStorage is unavailable (private mode, blocked storage) the banner
// just reappears next visit — GA4 still never loads without a fresh yes.
export function CookieConsent() {
  const [consent, setConsent] = useState<"granted" | "denied" | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(CONSENT_KEY);
      if (stored === "granted" || stored === "denied") {
        setConsent(stored);
      }
    } catch {
      // Storage blocked — treat as "no decision yet"; banner still works,
      // it just won't remember the choice across visits.
    }
    setReady(true);
  }, []);

  function decide(value: "granted" | "denied") {
    setConsent(value);
    try {
      window.localStorage.setItem(CONSENT_KEY, value);
    } catch {
      // Best effort — if this fails the banner just reappears next visit.
    }
  }

  return (
    <>
      {consent === "granted" && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`} strategy="afterInteractive" />
          <Script id="google-analytics" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_MEASUREMENT_ID}');`}
          </Script>
        </>
      )}

      {ready && consent === null && (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-page px-6 py-4 md:flex md:items-center md:justify-between md:gap-6">
          <p className="text-sm text-secondary mb-3 md:mb-0">
            เว็บไซต์นี้ใช้คุกกี้เพื่อวิเคราะห์การใช้งานและปรับปรุงประสบการณ์ของคุณ คุณเลือกยอมรับหรือปฏิเสธการเก็บข้อมูลเพื่อการวิเคราะห์ได้ทุกเมื่อ
          </p>
          <div className="flex gap-3 shrink-0">
            <button onClick={() => decide("denied")} className="rounded-md border border-border px-4 py-2 text-sm">
              ปฏิเสธ
            </button>
            <button onClick={() => decide("granted")} className="rounded-md bg-inverse text-onInverse px-4 py-2 text-sm">
              ยอมรับ
            </button>
          </div>
        </div>
      )}
    </>
  );
}
