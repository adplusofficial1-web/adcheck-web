"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";

// Admin > Marketing > Hunter — "ภาพรวมสถานะ Pipeline ของ Hunter ทุกคน" section
// (2026-09-01, per user request: "ต้องการ Section ดูภาพรวมจำนวนสถานะ Pipeline
// ของ Hunter ทุกคนรวมกัน กดเข้าไปดูสามารถดูได้รายคน"). Distinct from
// HunterCommissionOverview above it: that table is about REFERRAL commission
// (businesses.referred_by_hunter_user_id + hunter_commissions — who gets
// paid), this one is about each Hunter's own PRIVATE working pipeline
// (hunter_lead_pipeline — new/contacted/interested/closed_won/closed_lost/
// no_response per clinic they're personally tracking, set from their own
// /hunter page). A clinic can appear in one Hunter's pipeline without that
// Hunter ever being the one who gets commission for it, and vice versa —
// see migrations/014_hunter_referral_commissions.sql.
//
// Combined totals (all Hunters summed) sit at the top as a stat strip; the
// table below lists every Hunter with their own running total, and clicking
// a row expands it to show that Hunter's own breakdown per status —
// confirmed with the user: counts only, not the underlying list of
// individual clinics.

const POLL_MS = 15000;

type Totals = {
  new: number;
  contacted: number;
  interested: number;
  closed_won: number;
  closed_lost: number;
  no_response: number;
};

type HunterRow = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  new_count: number;
  contacted_count: number;
  interested_count: number;
  closed_won_count: number;
  closed_lost_count: number;
  no_response_count: number;
};

const STATUS_LABELS: { key: keyof Totals; label: string }[] = [
  { key: "new", label: "ใหม่" },
  { key: "contacted", label: "ติดต่อแล้ว" },
  { key: "interested", label: "สนใจ" },
  { key: "closed_won", label: "ปิดขายได้" },
  { key: "closed_lost", label: "ปิดขายไม่ได้" },
  { key: "no_response", label: "ไม่ตอบรับ" },
];

const thClass = "bg-inverse text-onInverse text-xs font-medium px-3 py-2 text-left";
const tdClass = "px-3 py-2 border-b border-border text-left align-top";

function rowTotal(h: HunterRow): number {
  return (
    h.new_count +
    h.contacted_count +
    h.interested_count +
    h.closed_won_count +
    h.closed_lost_count +
    h.no_response_count
  );
}

export function HunterPipelineOverview() {
  const [totals, setTotals] = useState<Totals | null>(null);
  const [byHunter, setByHunter] = useState<HunterRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/hunter-pipeline-overview", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "โหลดข้อมูลไม่สำเร็จ");
      if (!mounted.current) return;
      setTotals(data.totals);
      setByHunter(data.byHunter);
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

  return (
    <div className="mt-10">
      <h2 className="text-lg font-medium text-primary">Hunter — ภาพรวมสถานะ Pipeline</h2>
      <p className="mt-1 text-sm text-secondary max-w-2xl">
        นับจากสถานะที่ Hunter แต่ละคนตั้งเองต่อคลินิกที่ตนกำลังติดตาม (คนละชุดกับตารางค่าคอมมิชชั่นด้านบน) —
        คลิกที่ชื่อ Hunter เพื่อดูจำนวนแยกตามสถานะของคนนั้น
      </p>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      <div className="mt-4 flex flex-wrap gap-3">
        {STATUS_LABELS.map(({ key, label }) => (
          <div key={key} className="rounded-lg border border-border bg-surface px-4 py-3 min-w-[120px] flex-1">
            <div className="text-xs text-secondary whitespace-nowrap">{label}</div>
            <div className="mt-1 text-2xl font-medium text-primary">{totals ? totals[key] : "…"}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className={thClass}>ชื่อ</th>
              <th className={thClass}>สถานะ</th>
              <th className={thClass}>รวมคลินิกที่ติดตาม</th>
              <th className={thClass}></th>
            </tr>
          </thead>
          <tbody>
            {!byHunter ? (
              <tr>
                <td colSpan={4} className="text-center text-tertiary py-6">
                  กำลังโหลด…
                </td>
              </tr>
            ) : byHunter.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center text-tertiary py-6">
                  ยังไม่มี Hunter ในระบบ
                </td>
              </tr>
            ) : (
              byHunter.map((h) => (
                <Fragment key={h.id}>
                  <tr
                    className="cursor-pointer hover:bg-page"
                    onClick={() => setExpandedId(expandedId === h.id ? null : h.id)}
                  >
                    <td className={tdClass}>{h.name}</td>
                    <td className={tdClass}>
                      <span
                        className={`rounded-pill px-2.5 py-1 text-[11px] font-medium ${
                          h.active ? "bg-accentSoft text-accent" : "bg-dangerSoft text-danger"
                        }`}
                      >
                        {h.active ? "ใช้งานอยู่" : "ปิดใช้งาน"}
                      </span>
                    </td>
                    <td className={tdClass}>{rowTotal(h)}</td>
                    <td className={`${tdClass} text-secondary`}>
                      {expandedId === h.id ? "ซ่อน ▲" : "ดูรายละเอียด ▼"}
                    </td>
                  </tr>
                  {expandedId === h.id && (
                    <tr>
                      <td colSpan={4} className="px-3 py-3 border-b border-border bg-page">
                        <div className="flex flex-wrap gap-3">
                          <div className="text-xs text-secondary">ใหม่ {h.new_count}</div>
                          <div className="text-xs text-secondary">ติดต่อแล้ว {h.contacted_count}</div>
                          <div className="text-xs text-secondary">สนใจ {h.interested_count}</div>
                          <div className="text-xs text-secondary">ปิดขายได้ {h.closed_won_count}</div>
                          <div className="text-xs text-secondary">ปิดขายไม่ได้ {h.closed_lost_count}</div>
                          <div className="text-xs text-secondary">ไม่ตอบรับ {h.no_response_count}</div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
