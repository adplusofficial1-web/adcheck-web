"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { HunterPipelineStatus } from "@/lib/hunterPipeline";

// Admin > Marketing > Hunter — "Pipeline รวม ของ Hunter" summary strip.
// A combined total across EVERY Hunter's leads (shared admin-sent queue +
// each Hunter's own self-sourced clinics) — scoped down, per user request,
// to just the 6 status totals (no per-Hunter breakdown, no merged Kanban
// board — those stay private to each Hunter on /hunter, see
// components/hunter/HunterPipelineTab.tsx, which this mirrors the label/
// color scheme of so the same status reads the same color everywhere).
// Polling pattern copied from HunterCommissionOverview.tsx.
//
// CHANGE (2026-09-02, Hunter tab restructure, per user request): stays
// pinned above the tab bar in app/admin/marketing/hunter/page.tsx (not
// itself a tab, see components/admin/HunterMarketingTabs.tsx) since it's
// glance-level info an admin wants visible no matter which tab they're on.
// Also asked to "add detail and make the overview nicer" — added a total
// count + closed-won-rate headline, and a per-stage share-of-total
// percentage with a small proportional bar under each count. All computed
// client-side from the same 6 numbers the API already returned — no
// backend change needed for this.

const POLL_MS = 15000;

const STAGES: { key: HunterPipelineStatus; label: string; dot: string; text: string; bar: string }[] = [
  { key: "new", label: "ส่งมาแล้ว", dot: "bg-tertiary", text: "text-secondary", bar: "bg-tertiary" },
  { key: "contacted", label: "ติดต่อแล้ว", dot: "bg-secondary", text: "text-secondary", bar: "bg-secondary" },
  { key: "interested", label: "สนใจ", dot: "bg-warning", text: "text-warning", bar: "bg-warning" },
  { key: "closed_won", label: "ปิดได้", dot: "bg-accent", text: "text-accent", bar: "bg-accent" },
  { key: "closed_lost", label: "ปิดไม่ได้", dot: "bg-danger", text: "text-danger", bar: "bg-danger" },
  { key: "no_response", label: "ไม่ตอบรับ", dot: "bg-tertiary", text: "text-tertiary", bar: "bg-tertiary" },
];

type Overview = Record<HunterPipelineStatus, number>;

export function HunterPipelineOverview() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/hunter-pipeline", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "โหลดข้อมูลไม่สำเร็จ");
      if (!mounted.current) return;
      setOverview(data.overview);
      setError(null);
    } catch (e: any) {
      if (mounted.current) setError(e?.message || "โหลดข้อมูลไม่สำเร็จ");
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    load();
    const tick = () => {
      pollTimer.current = setTimeout(async () => {
        await load();
        tick();
      }, POLL_MS);
    };
    tick();
    return () => {
      mounted.current = false;
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [load]);

  const total = overview ? STAGES.reduce((sum, s) => sum + overview[s.key], 0) : null;
  const closedWonShare = overview && total ? Math.round((overview.closed_won / total) * 100) : null;

  return (
    <div className="mt-10">
      <div className="flex items-baseline justify-between flex-wrap gap-x-3 gap-y-1">
        <h2 className="text-lg font-medium text-primary">Pipeline รวม ของ Hunter</h2>
        {total !== null && (
          <span className="text-xs text-tertiary whitespace-nowrap">
            รวม {total.toLocaleString("th-TH")} รายการ
            {closedWonShare !== null && <> · ปิดได้ {closedWonShare}%</>}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-secondary max-w-2xl">
        ยอดรวมสถานะ pipeline จาก Hunter ทุกคน ทั้งคลินิกที่แอดมิน &quot;ส่ง&quot; ให้ และคลินิกที่ Hunter หามาเอง —
        แต่ละ Hunter เห็นเฉพาะสถานะของตัวเองแบบละเอียดในหน้า /hunter ส่วนนี้เป็นแค่ยอดรวมภาพกว้างสำหรับแอดมิน
        (อัปเดตทุก {Math.round(POLL_MS / 1000)} วินาที)
      </p>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {STAGES.map((stage) => {
          const count = overview ? overview[stage.key] : null;
          const share = count !== null && total ? Math.round((count / total) * 100) : null;
          const barWidth = share === null ? 0 : count && count > 0 ? Math.max(share, 3) : 0;
          return (
            <div key={stage.key} className="rounded-xl border border-border bg-page p-4">
              <div className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${stage.dot}`} />
                <span className={`text-xs font-medium ${stage.text}`}>{stage.label}</span>
              </div>
              <div className="mt-2 text-2xl font-medium text-primary">{count !== null ? count : "…"}</div>
              <div className="mt-2.5 h-1.5 rounded-full bg-border overflow-hidden">
                <div className={`h-full rounded-full ${stage.bar}`} style={{ width: `${barWidth}%` }} />
              </div>
              <div className="mt-1 text-[11px] text-tertiary">{share !== null ? `${share}% ของทั้งหมด` : ""}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
