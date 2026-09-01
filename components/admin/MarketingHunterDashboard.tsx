"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Admin > Marketing > Hunter — compact "ภาพรวม" (overview) stat strip shown
// at the very top of the page, above SalesOverview / HunterUsersManager /
// HunterCommissionOverview / HunterImport (2026-09-01, per user request:
// "ปรับหน้าให้ดูรายละเอียดง่ายขึ้นเน้นดูภาพรวม"). Purely a read-only summary —
// it does not replace or remove any of the detailed tables below, which an
// admin can still scroll to for the full breakdown. Every number here comes
// from the SAME three endpoints those sections already poll (no new API
// route), so it can never disagree with the detail tables underneath it.
//
// Deliberately its own small polling loop (matching the ~12-15s cadence of
// the sections below) rather than lifting state into a shared context —
// keeps this purely additive: nothing about how the existing sections fetch
// or render their own data changes.

const POLL_MS = 15000;

type HunterLeadsResponse = {
  leads?: { status: string; hunter_sent_at: string | null }[];
};
type SalesOverviewResponse = {
  overview?: { active: boolean; closed_won_count: number }[];
};
type HunterCommissionResponse = {
  overview?: { active: boolean; pending_thb: string; paid_thb: string }[];
};

type Stats = {
  awaitingReview: number;
  queued: number;
  sent: number;
  activeSales: number;
  closedWonTotal: number;
  activeHunters: number;
  pendingCommissionThb: number;
  paidCommissionThb: number;
};

const thb = (v: number) => v.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3 min-w-[136px] flex-1">
      <div className="text-xs text-secondary whitespace-nowrap">{label}</div>
      <div className="mt-1 text-2xl font-medium text-primary">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-tertiary whitespace-nowrap">{sub}</div>}
    </div>
  );
}

export function MarketingHunterDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    try {
      const [leadsRes, salesRes, huntersRes] = await Promise.all([
        fetch("/api/admin/hunter", { cache: "no-store" }),
        fetch("/api/admin/sales-overview", { cache: "no-store" }),
        fetch("/api/admin/hunter-commissions", { cache: "no-store" }),
      ]);
      const [leadsData, salesData, huntersData]: [HunterLeadsResponse, SalesOverviewResponse, HunterCommissionResponse] =
        await Promise.all([leadsRes.json(), salesRes.json(), huntersRes.json()]);
      if (!leadsRes.ok || !salesRes.ok || !huntersRes.ok) {
        throw new Error("โหลดภาพรวมไม่สำเร็จ");
      }
      if (!mounted.current) return;

      const leads = leadsData.leads ?? [];
      const awaitingReview = leads.filter((l) => l.status !== "done" && !l.hunter_sent_at).length;
      const queued = leads.filter((l) => l.status === "done" && !l.hunter_sent_at).length;
      const sent = leads.filter((l) => l.hunter_sent_at).length;

      const sales = salesData.overview ?? [];
      const activeSales = sales.filter((s) => s.active).length;
      const closedWonTotal = sales.reduce((sum, s) => sum + (s.closed_won_count || 0), 0);

      const hunters = huntersData.overview ?? [];
      const activeHunters = hunters.filter((h) => h.active).length;
      const pendingCommissionThb = hunters.reduce((sum, h) => sum + Number(h.pending_thb || 0), 0);
      const paidCommissionThb = hunters.reduce((sum, h) => sum + Number(h.paid_thb || 0), 0);

      setStats({
        awaitingReview,
        queued,
        sent,
        activeSales,
        closedWonTotal,
        activeHunters,
        pendingCommissionThb,
        paidCommissionThb,
      });
      setError(null);
    } catch (e: any) {
      if (mounted.current) setError(e?.message || "โหลดภาพรวมไม่สำเร็จ");
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

  if (error) {
    return (
      <div className="mt-6">
        <p className="text-sm text-danger">{error}</p>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <h2 className="text-sm font-medium text-secondary mb-2">ภาพรวม</h2>
      <div className="flex flex-wrap gap-3">
        <StatCard label="รอตรวจสอบ" value={stats ? String(stats.awaitingReview) : "…"} sub="คิว Hunter" />
        <StatCard label="รอคิว" value={stats ? String(stats.queued) : "…"} sub="ตรวจแล้ว ยังไม่ส่ง" />
        <StatCard label="ส่งสำเร็จ" value={stats ? String(stats.sent) : "…"} sub="ถึงมือ Hunter แล้ว" />
        <StatCard
          label="เซลล์ใช้งานอยู่"
          value={stats ? String(stats.activeSales) : "…"}
          sub={stats ? `ปิดขายได้รวม ${stats.closedWonTotal}` : undefined}
        />
        <StatCard label="Hunter ใช้งานอยู่" value={stats ? String(stats.activeHunters) : "…"} />
        <StatCard label="ค่าคอมรอโอน" value={stats ? `฿${thb(stats.pendingCommissionThb)}` : "…"} sub="Hunter ทั้งหมด" />
        <StatCard label="ค่าคอมโอนแล้ว" value={stats ? `฿${thb(stats.paidCommissionThb)}` : "…"} sub="Hunter ทั้งหมด" />
      </div>
    </div>
  );
}
