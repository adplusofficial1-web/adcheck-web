"use client";

import { useEffect } from "react";

/**
 * Renders nothing — just triggers the browser's native print dialog once
 * the page has mounted. Used by the printable PDF report pages
 * (app/results/[id]/pdf/page.tsx, app/share/[token]/pdf/page.tsx) so
 * opening that page immediately offers "Save as PDF", instead of requiring
 * a manual click.
 * Kept as its own tiny client component so the page around it can stay a
 * server component.
 *
 * Bug Audit 4 (2569-09-02): pictures are no longer inline base64 — they're
 * fetched from /api/images/[id] like any other image — so a fixed 300 ms
 * delay would open the print dialog with empty picture boxes. Wait until
 * every <img> on the page has finished loading (or errored), capped at a
 * few seconds so a stalled image can never block printing entirely.
 */
export function AutoPrint() {
  useEffect(() => {
    let cancelled = false;
    let printed = false;
    const print = () => {
      if (cancelled || printed) return;
      printed = true;
      window.print();
    };

    const images = Array.from(document.images);
    const pending = images.filter((img) => !img.complete);
    const cap = setTimeout(print, 8000);

    if (pending.length === 0) {
      // Give layout a beat to settle, same as before.
      const t = setTimeout(print, 300);
      return () => {
        cancelled = true;
        clearTimeout(t);
        clearTimeout(cap);
      };
    }

    let remaining = pending.length;
    const onDone = () => {
      remaining -= 1;
      if (remaining <= 0) setTimeout(print, 300);
    };
    pending.forEach((img) => {
      img.addEventListener("load", onDone, { once: true });
      img.addEventListener("error", onDone, { once: true });
    });
    return () => {
      cancelled = true;
      clearTimeout(cap);
      pending.forEach((img) => {
        img.removeEventListener("load", onDone);
        img.removeEventListener("error", onDone);
      });
    };
  }, []);

  return null;
}
