"use client";

import { useState } from "react";
import { HunterOverviewTab } from "@/components/hunter/HunterOverviewTab";
import { HunterPipelineTab } from "@/components/hunter/HunterPipelineTab";
import { HunterCommissionTab } from "@/components/hunter/HunterCommissionTab";
import { HunterSettingsTab } from "@/components/hunter/HunterSettingsTab";

// The /hunter page's tab switcher — see app/hunter/page.tsx. Replaces the
// previous single-table layout (just HunterFreelancerList) now that a
// Hunter has four things to look at: their overview stats, their private
// working Pipeline, their referral commission + payout settings, and their
// personal/tax details. Each tab fetches its own data independently (same
// convention as /sales's own components) rather than one shared fetch
// lifted up here, so switching tabs doesn't need to coordinate loading
// state across four unrelated API calls.

type Tab = "overview" | "pipeline" | "commission" | "settings";

const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "ภาพรวม" },
  { key: "pipeline", label: "Pipeline" },
  { key: "commission", label: "ค่าคอมมิชชั่น & การรับเงิน" },
  { key: "settings", label: "ตั้งค่า" },
];

export function HunterTabs() {
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <div>
      <div className="flex gap-6 border-b border-border overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`whitespace-nowrap py-3 text-sm font-medium border-b-2 -mb-px ${
              tab === t.key ? "text-primary border-accent" : "text-secondary border-transparent"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="mt-6">
        {tab === "overview" && <HunterOverviewTab />}
        {tab === "pipeline" && <HunterPipelineTab />}
        {tab === "commission" && <HunterCommissionTab />}
        {tab === "settings" && <HunterSettingsTab />}
      </div>
    </div>
  );
}
