"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Two unrelated tools share the /admin/marketing space: the association
// outreach pipeline (page.tsx, lib/marketingAssociations.ts) and the
// Hunter Excel-import queue (hunter/page.tsx, components/admin/HunterImport.tsx)
// — kept as separate routes rather than one merged page for the same
// reason AdminNav.tsx keeps "รายงานปัญหา" out of "Marketing": different
// data, different workflow, mixing them just confuses both. This sub-nav
// is the equivalent one level down.
const TABS = [
  { href: "/admin/marketing", label: "ติดตามสมาคม" },
  { href: "/admin/marketing/hunter", label: "Hunter" },
];

export function MarketingSubNav() {
  const pathname = usePathname();

  return (
    <div className="inline-flex items-center gap-1 rounded-pill bg-page border border-border p-1 mb-6">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-pill px-4 py-1.5 text-sm transition-colors ${
              active ? "bg-inverse text-onInverse font-medium" : "text-secondary hover:text-primary"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
