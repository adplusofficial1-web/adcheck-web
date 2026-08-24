"use client";

import { useEffect } from "react";

/**
 * Renders nothing — just triggers the browser's native print dialog once
 * the page has mounted. Used by the printable PDF report page
 * (app/results/[id]/pdf/page.tsx) so opening that page immediately offers
 * "Save as PDF", instead of requiring a manual click. Kept as its own tiny
 * client component so the page around it can stay a server component.
 */
export function AutoPrint() {
  useEffect(() => {
    // Small delay so images (base64 data URLs, already inline — but give
    // layout a beat to settle) are painted before the print dialog opens.
    const t = setTimeout(() => window.print(), 300);
    return () => clearTimeout(t);
  }, []);

  return null;
}
