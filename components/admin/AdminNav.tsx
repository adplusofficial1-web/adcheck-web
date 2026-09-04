"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/knowledge-base", label: "คลังความรู้" },
  { href: "/admin/marketing", label: "Marketing" },
  { href: "/admin/credits", label: "เครดิต" },
  // Interim manual QR PromptPay / bank-transfer review queue (2569-09-03)
  // -- see lib/paymentMode.ts. Pull this tab once PAYMENT_MODE is back to
  // "omise" and manual_payment_requests has stopped taking new rows, if it
  // ever feels like clutter -- the underlying data/API stays intact either
  // way for historical lookups.
  { href: "/admin/manual-payments", label: "ตรวจสลิปโอนเงิน" },
  // Kept as its own tab rather than folded into "Marketing" above — that
  // page is an unrelated professional-association outreach tracker (see
  // lib/marketingAssociations.ts), and mixing customer-reported bugs into
  // it would only confuse both lists. See migrations/005_issue_reports.sql.
  { href: "/admin/reports", label: "รายงานปัญหา" },
];

// Segmented-control style tab menu for the two Platform Admin sections.
// A client component (needs usePathname for the active-tab highlight)
// living inside app/admin/layout.tsx, which stays a server component for
// the auth() check above it.
//
// fix(mobile): the pill row previously had no flex-wrap and fixed
// px-5/py-2/text-sm sizing, so the 5 tabs (one label runs to 16
// characters) overflowed narrow phone widths and forced horizontal
// scroll on every admin page (this component renders inside the shared
// admin header). Now wraps onto multiple lines on mobile with tighter
// padding/text, and returns to the original spacing at sm and up —
// no visual change on tablet/desktop.
export function AdminNav() {
  const pathname = usePathname();

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-pill bg-white/10 p-1">
      {TABS.map((tab) => {
        const active = pathname?.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-pill px-3 py-1.5 text-xs whitespace-nowrap transition-colors sm:px-5 sm:py-2 sm:text-sm ${
              active ? "bg-onInverse font-medium text-inverse" : "text-onInverse/75 hover:text-onInverse"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
