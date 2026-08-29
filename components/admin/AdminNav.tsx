"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/knowledge-base", label: "คลังความรู้" },
  { href: "/admin/inside", label: "Inside" },
  { href: "/admin/credits", label: "เครดิต" },
];

// Segmented-control style tab menu for the two Platform Admin sections.
// A client component (needs usePathname for the active-tab highlight)
// living inside app/admin/layout.tsx, which stays a server component for
// the auth() check above it.
export function AdminNav() {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-1 rounded-pill bg-white/10 p-1">
      {TABS.map((tab) => {
        const active = pathname?.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-pill px-5 py-2 text-sm transition-colors ${
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
