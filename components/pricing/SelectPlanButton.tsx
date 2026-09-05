"use client";

import Link from "next/link";
import { trackEvent } from "@/lib/gtag";

// Thin client wrapper around next/link's <Link> so PricingContent.tsx
// (an async server component -- see components/pricing/PricingContent.tsx)
// can still fire a GA4 select_item event on click without itself needing
// to be a client component.
export function SelectPlanButton({
  href,
  planCode,
  planName,
  priceThb,
  isPopular,
  children,
}: {
  href: string;
  planCode: string;
  planName: string;
  priceThb: number;
  isPopular?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={() =>
        trackEvent("select_item", {
          items: [{ item_id: planCode, item_name: planName, price: priceThb }],
        })
      }
      className={
        isPopular
        ? "block text-center rounded-md px-4 py-2 text-sm font-medium bg-inverse text-onInverse"
        : "block text-center rounded-md px-4 py-2 text-sm font-medium border border-border"
      }
      >
      {children}
    </Link>
    );
}
