"use client";

import { useState } from "react";
import { HunterImport } from "@/components/admin/HunterImport";
import { SalesOverview } from "@/components/admin/SalesOverview";
import { HunterUsersManager } from "@/components/admin/HunterUsersManager";
import { HunterCommissionOverview } from "@/components/admin/HunterCommissionOverview";
import { HunterCommissionPayoutQueue } from "@/components/admin/HunterCommissionPayoutQueue";

// Admin > Marketing > Hunter — tab shell for everything below the
// "Pipeline รวม" summary strip (see app/admin/marketing/hunter/page.tsx).
//
// ADDED (2026-09-02, per user request): this page used to stack 5 sections
// on top of each other — เซลล์ & การกระจาย Lead, Hunter Freelancer whitelist,
// commission overview, commission payout queue, then the (long, 1000+ row)
// Hunter import queue — one continuous scroll. The admin asked for each of
// those to become its own tab instead, renamed shorter to fit a tab bar:
//   - "คิว Hunter"        (HunterImport — unchanged name, already short)
//   - "กระจาย Lead"       (was "เซลล์ & การกระจาย Lead", SalesOverview)
//   - "สิทธิ์เข้า /hunter" (was "Hunter Freelancer (สิทธิ์เข้า /hunter)", HunterUsersManager)
//   - "Commission"        (was "Hunter — ภาพรวมและค่าคอมมิชชั่น", HunterCommissionOverview)
//   - "Finance"           (was "คิวจ่ายค่าคอมมิชชั่น", split out into its own
//                           component HunterCommissionPayoutQueue — see that
//                           file's comment)
//
// Tab bar styling deliberately mirrors components/admin/MarketingSubNav.tsx
// (same rounded-pill/bg-inverse pattern already used one level up, for
// "ติดตามสมาคม" vs "Hunter") so the two tab levels read as one consistent
// system instead of two different widgets.
//
// Each tab's content only mounts while active (not just hidden) — every
// one of these components polls its own API on an interval (12-15s) while
// mounted, so switching away actually stops that tab's background
// requests instead of running all 5 tabs' polling loops at once
// regardless of which one is visible on screen.
const TABS = [
  { key: "queue", label: "คิว Hunter" },
  { key: "distribution", label: "กระจาย Lead" },
  { key: "access", label: "สิทธิ์เข้า /hunter" },
  { key: "commission", label: "Commission" },
  { key: "finance", label: "Finance" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function HunterMarketingTabs() {
  const [active, setActive] = useState<TabKey>("queue");

  return (
    <div>
      <div className="inline-flex flex-wrap items-center gap-1 rounded-pill bg-page border border-border p-1 mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActive(tab.key)}
            className={`rounded-pill px-4 py-1.5 text-sm transition-colors whitespace-nowrap ${
              active === tab.key ? "bg-inverse text-onInverse font-medium" : "text-secondary hover:text-primary"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {active === "queue" && <HunterImport />}
      {active === "distribution" && <SalesOverview />}
      {active === "access" && <HunterUsersManager />}
      {active === "commission" && <HunterCommissionOverview />}
      {active === "finance" && <HunterCommissionPayoutQueue />}
    </div>
  );
}
