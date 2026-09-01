"use client";

import { useState } from "react";
import { HunterOverviewTab } from "@/components/hunter/HunterOverviewTab";
import { HunterPipelineTab } from "@/components/hunter/HunterPipelineTab";
import { HunterCommissionTab } from "@/components/hunter/HunterCommissionTab";
import { HunterSettingsTab } from "@/components/hunter/HunterSettingsTab";
import { HunterHelpTab } from "@/components/hunter/HunterHelpTab";

// The /hunter page's header + tab switcher — replaces the old split of
// app/hunter/page.tsx (header) + components/hunter/HunterTabs.tsx (a
// second tab strip further down the page, under the "พื้นที่ Hunter"
// heading). Per user request (2569-09-01, "ปรับไปอยู่ด้านบน ไว้ตรง NAV"):
// the tab switcher now lives IN the dark header bar itself — same place
// components/Nav.tsx (the main clinic/agency app's shared header) puts
// its own menu links — instead of as a separate strip lower on the page.
// This component owns the `tab` state (previously HunterTabs.tsx did) and
// renders both the header's tab links and the selected tab's content, so
// app/hunter/page.tsx (a server component) can stay a thin data-fetching
// wrapper around one client component.
//
// CHANGE (2569-09-01, per user request "ขยายการแสดงผลให้กว้างขึ้น ให้ดู
// สวยงาม" after seeing the 6-column Pipeline board on a live screenshot):
// widened the page's content column from max-w-4xl (896px) to max-w-6xl
// (1152px) — at max-w-4xl the 6 Kanban columns had almost no breathing
// room (tiny padding, cramped cards); this gives every tab (not just
// Pipeline) noticeably more width to work with on desktop, while still
// comfortably fitting inside typical viewports (it's a max-width, not a
// fixed width, so nothing changes on mobile/tablet).
type Tab = "overview" | "pipeline" | "commission" | "settings" | "help";

const TABS: { key: Tab; label: string }[] = [
  // FIX (per user request, 2569-09-01): renamed from "ภาพรวม" to
  // "Dashboard" — same English label the main clinic/agency Nav already
  // uses for its own overview page (components/Nav.tsx's "Dashboard"
  // menu item), so the two areas read consistently. Tab `key` stays
  // "overview" — nothing about routing/state changes, only the label.
  { key: "overview", label: "Dashboard" },
  { key: "pipeline", label: "Pipeline" },
  { key: "commission", label: "ค่าคอมมิชชั่น & การรับเงิน" },
  { key: "settings", label: "ตั้งค่า" },
  // New tab (per user request, 2569-09-01, "เพิ่มหน้าวิธีการใช้งาน") — see
  // components/hunter/HunterHelpTab.tsx.
  { key: "help", label: "วิธีการใช้งาน" },
];

type HunterHeaderInfo = { name: string; email: string; avatarUrl: string | null };

function HunterAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />;
  }
  return (
    <div className="w-8 h-8 rounded-full bg-white/10 border border-onInverse/30 flex items-center justify-center text-xs font-medium shrink-0">
      {name?.trim()?.[0]?.toUpperCase() || "?"}
    </div>
  );
}

export function HunterShell({ hunterUser }: { hunterUser: HunterHeaderInfo }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [avatarUrl, setAvatarUrl] = useState(hunterUser.avatarUrl);

  function TabButton({ t, className }: { t: (typeof TABS)[number]; className: (active: boolean) => string }) {
    const active = tab === t.key;
    return (
      <button key={t.key} type="button" onClick={() => setTab(t.key)} className={className(active)}>
        {t.label}
      </button>
    );
  }

  return (
    <div className="min-h-screen bg-page">
      <header className="bg-inverse text-onInverse px-6 md:px-14 py-5">
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-2xl font-medium">ADCheck</span>
            <span className="rounded-pill bg-white/10 border border-onInverse/30 px-3 py-1 text-xs">Hunter</span>
          </div>

          <div className="flex items-center gap-8 min-w-0">
            <div className="hidden md:flex items-center gap-6 text-sm">
              {TABS.map((t) => (
                <TabButton
                  key={t.key}
                  t={t}
                  className={(active) =>
                    `whitespace-nowrap transition-colors ${
                      active ? "text-onInverse font-medium" : "text-onInverse/70 hover:text-onInverse"
                    }`
                  }
                />
              ))}
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <HunterAvatar name={hunterUser.name} avatarUrl={avatarUrl} />
              <span className="hidden sm:block text-sm text-onInverse/70 truncate max-w-[220px]">
                {hunterUser.name} · {hunterUser.email}
              </span>
            </div>
          </div>
        </div>

        {/* Small-screen tab row — same pattern as components/Nav.tsx's own
            small-screen row: same links, wrapping under the header instead
            of hidden. */}
        <div className="flex md:hidden flex-wrap gap-x-5 gap-y-2 text-sm mt-4">
          {TABS.map((t) => (
            <TabButton
              key={t.key}
              t={t}
              className={(active) => (active ? "text-onInverse font-medium" : "text-onInverse/70")}
            />
          ))}
        </div>
      </header>

      <main className="px-6 md:px-14 py-10 max-w-6xl mx-auto">
        <div>
          <h1 className="text-2xl font-medium text-primary">พื้นที่ Hunter</h1>
          <p className="mt-2 text-sm text-secondary max-w-2xl">
            ภาพรวม, Pipeline ของคุณเอง, ค่าคอมมิชชั่น และการตั้งค่าบัญชี
          </p>
        </div>
        <div className="mt-6">
          {tab === "overview" && <HunterOverviewTab />}
          {tab === "pipeline" && <HunterPipelineTab />}
          {tab === "commission" && <HunterCommissionTab />}
          {tab === "settings" && <HunterSettingsTab onAvatarChange={setAvatarUrl} />}
          {tab === "help" && <HunterHelpTab />}
        </div>
      </main>
    </div>
  );
}
