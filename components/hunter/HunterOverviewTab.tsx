"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// /hunter's "ภาพรวม" tab — summary stats + the referral-link card that's
// the ONLY way a clinic ever gets attributed to a Hunter (see
// lib/currentBusiness.ts / migrations/014_hunter_referral_commissions.sql).
// All figures come from GET /api/hunter/commissions — see
// lib/hunterCommission.ts for how each one is derived.

type Stats = {
  referredCount: number;
  totalCommissionThb: number;
  pendingThb: number;
  paidThb: number;
  thisMonthThb: number;
  closedWonCount: number;
};

type ChartPoint = { label: string; value: number };

const thb = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

function CommissionChart({ daily, monthly }: { daily: ChartPoint[]; monthly: ChartPoint[] }) {
  const [period, setPeriod] = useState<"daily" | "monthly">("daily");
  const [hovered, setHovered] = useState<number | null>(null);
  const series = period === "daily" ? daily : monthly;
  const max = Math.max(...series.map((d) => d.value), 1);

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-sm font-medium text-primary">ค่าคอมมิชชั่นตามช่วงเวลา</span>
        <div className="flex gap-1.5">
          {(["daily", "monthly"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`rounded-pill px-2.5 py-1 text-xs font-medium border ${
                period === p ? "bg-inverse text-onInverse border-inverse" : "bg-surface text-secondary border-border"
              }`}
            >
              {p === "daily" ? "รายวัน" : "รายเดือน"}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-5 flex items-end gap-2 border-b border-border" style={{ height: 150 }}>
        {series.map((d, i) => (
          <div
            key={i}
            className="flex-1 flex flex-col items-center relative"
            style={{ maxWidth: 24 }}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          >
            {hovered === i && (
              <div className="absolute bottom-full mb-1.5 rounded-md bg-inverse text-onInverse text-[11px] px-1.5 py-0.5 whitespace-nowrap z-10">
                ฿{thb(d.value)}
              </div>
            )}
            <div
              className="w-full bg-accent rounded-t"
              style={{ maxWidth: 20, height: Math.max(Math.round((d.value / max) * 120), d.value > 0 ? 3 : 1) }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-2">
        {series.map((d, i) => (
          <div key={i} className="flex-1 text-center text-[10px] text-tertiary" style={{ maxWidth: 24 }}>
            {d.label}
          </div>
        ))}
      </div>
    </div>
  );
}

export function HunterOverviewTab() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [chart, setChart] = useState<{ daily: ChartPoint[]; monthly: ChartPoint[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [referralLink, setReferralLink] = useState<string | null>(null);
  const [copyLabel, setCopyLabel] = useState("คัดลอกลิงก์");
  const copyResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/hunter/commissions", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "โหลดข้อมูลไม่สำเร็จ");
      setStats(data.stats);
      setChart(data.chart);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "โหลดข้อมูลไม่สำเร็จ");
    }
  }, []);

  useEffect(() => {
    load();
    // Referral link needs this Hunter's own id — /api/hunter/settings
    // already returns the full hunter_users row (see that route), so this
    // avoids a third dedicated endpoint just for one URL.
    (async () => {
      try {
        const res = await fetch("/api/hunter/settings", { cache: "no-store" });
        const data = await res.json();
        if (res.ok && data?.settings?.id) {
          setReferralLink(`${window.location.origin}/login?ref=${data.settings.id}`);
        }
      } catch {
        // Non-fatal — the rest of the tab still works without the link.
      }
    })();
  }, [load]);

  const copyReferralLink = async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = referralLink;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
      } catch {
        document.body.removeChild(textarea);
        return;
      }
      document.body.removeChild(textarea);
    }
    setCopyLabel("คัดลอกแล้ว ✓");
    if (copyResetTimer.current) clearTimeout(copyResetTimer.current);
    copyResetTimer.current = setTimeout(() => setCopyLabel("คัดลอกลิงก์"), 2000);
  };

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!stats || !chart) return <p className="text-sm text-secondary">กำลังโหลด…</p>;

  return (
    <div>
      <p className="text-sm text-secondary max-w-2xl">
        สรุปผลงานและค่าคอมมิชชั่นของคุณจากคลินิกที่สมัครผ่านลิงก์ชวนสมัครของคุณ
      </p>

      <div className="mt-6 flex flex-wrap gap-3.5">
        <div className="rounded-lg border border-border bg-surface px-4 py-4 flex-1" style={{ minWidth: 160 }}>
          <div className="text-xs text-secondary">คลินิกที่แนะนำทั้งหมด</div>
          <div className="mt-1.5 text-2xl font-semibold text-primary">{stats.referredCount}</div>
        </div>
        <div className="rounded-lg border border-border bg-surface px-4 py-4 flex-1" style={{ minWidth: 160 }}>
          <div className="text-xs text-secondary">ปิดได้ (ส่วนตัว)</div>
          <div className="mt-1.5 text-2xl font-semibold text-accent">{stats.closedWonCount}</div>
        </div>
        <div className="rounded-lg border border-border bg-surface px-4 py-4 flex-1" style={{ minWidth: 160 }}>
          <div className="text-xs text-secondary">ค่าคอมสะสมทั้งหมด</div>
          <div className="mt-1.5 text-2xl font-semibold text-primary">฿{thb(stats.totalCommissionThb)}</div>
        </div>
      </div>

      <div className="mt-3.5 flex flex-wrap gap-3.5">
        <div className="rounded-lg bg-warningSoft px-4 py-3 flex-1" style={{ minWidth: 160 }}>
          <div className="text-xs text-warning">รอโอน</div>
          <div className="mt-1.5 text-lg font-semibold text-warning">฿{thb(stats.pendingThb)}</div>
        </div>
        <div className="rounded-lg bg-accentSoft px-4 py-3 flex-1" style={{ minWidth: 160 }}>
          <div className="text-xs text-accent">โอนแล้ว</div>
          <div className="mt-1.5 text-lg font-semibold text-accent">฿{thb(stats.paidThb)}</div>
        </div>
        <div className="rounded-lg border border-border bg-surface px-4 py-3 flex-1" style={{ minWidth: 160 }}>
          <div className="text-xs text-secondary">เดือนนี้</div>
          <div className="mt-1.5 text-lg font-semibold text-primary">฿{thb(stats.thisMonthThb)}</div>
        </div>
      </div>

      <div className="mt-6">
        <CommissionChart daily={chart.daily} monthly={chart.monthly} />
      </div>

      <div className="mt-4 rounded-lg border border-border bg-surface p-4">
        <span className="text-sm font-medium text-primary">ลิงก์ชวนสมัครของคุณ</span>
        <p className="mt-2 text-xs text-secondary max-w-xl">
          ส่งลิงก์นี้ให้คลินิกที่คุณติดต่อเอง — เมื่อคลินิกสมัครผ่านลิงก์นี้ครั้งแรก ระบบจะจำไว้ถาวรว่าเป็นลูกค้าของคุณ
          และคุณจะได้ค่าคอมทุกครั้งที่คลินิกนั้นจ่ายเงิน ไม่มีวันหมดอายุ
        </p>
        <div className="mt-3 flex gap-2 flex-wrap">
          <div className="flex-1 rounded-md border border-border bg-page px-2.5 py-2 text-xs text-secondary overflow-x-auto whitespace-nowrap" style={{ minWidth: 220 }}>
            {referralLink ?? "กำลังโหลด…"}
          </div>
          <button
            type="button"
            onClick={copyReferralLink}
            disabled={!referralLink}
            className="rounded-md bg-inverse text-onInverse px-3 py-1.5 text-xs font-medium disabled:opacity-40"
          >
            {copyLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
