"use client";

import { useState } from "react";
import type { MonthlyTrendReport } from "@/lib/monthlyTrendReport";

type Props = { report: MonthlyTrendReport };

type Trend = { label: string; tone: "up" | "down" | "flat" | "new" };

const TREND_CLASSES: Record<Trend["tone"], string> = {
  up: "bg-dangerSoft text-danger",
  down: "bg-accentSoft text-accent",
  flat: "bg-warningSoft text-warning",
  new: "bg-warningSoft text-warning",
};

// Client half of /admin/inside — all the real numbers arrive as props from
// the server component (page.tsx), already queried from
// lib/monthlyTrendReport.ts. This component only owns UI state: which of
// the last N months is currently selected.
export function InsideReport({ report }: Props) {
  const { months, categoriesByMonth } = report;
  const latestKey = months[months.length - 1]?.monthKey ?? "";
  const [activeKey, setActiveKey] = useState(latestKey);

  const activeIdx = months.findIndex((m) => m.monthKey === activeKey);
  const active = months[activeIdx] ?? months[months.length - 1];
  const prev = activeIdx > 0 ? months[activeIdx - 1] : null;

  const activeCategories = categoriesByMonth[active?.monthKey ?? ""] ?? [];
  const prevCategories = prev ? categoriesByMonth[prev.monthKey] ?? [] : [];

  const categoriesWithTrend = activeCategories.map((c) => {
    const prevMatch = prevCategories.find((p) => p.category === c.category);
    let trend: Trend | null = null;
    if (prevMatch) {
      const diff = c.pct - prevMatch.pct;
      if (diff > 0) trend = { label: `▲ +${diff}% จากเดือนก่อน`, tone: "up" };
      else if (diff < 0) trend = { label: `▼ ${diff}% จากเดือนก่อน`, tone: "down" };
      else trend = { label: "▬ ทรงตัวจากเดือนก่อน", tone: "flat" };
    } else if (prev) {
      trend = { label: "ใหม่ในเดือนนี้", tone: "new" };
    }
    return { ...c, trend };
  });

  const flaggedPcts = months.map((m) => m.flaggedPct);
  const maxFlaggedPct = Math.max(...flaggedPcts, 1);
  const minFlaggedPct = Math.min(...flaggedPcts);
  const hasSpread = maxFlaggedPct !== minFlaggedPct;

  const insights: string[] = [];
  if (active && hasSpread && active.flaggedPct === maxFlaggedPct) {
    insights.push(`อัตราการพบความเสี่ยงโดยรวมเดือนนี้ (${active.flaggedPct}%) สูงที่สุดในรอบ ${months.length} เดือน`);
  } else if (active && hasSpread && active.flaggedPct === minFlaggedPct) {
    insights.push(`อัตราการพบความเสี่ยงโดยรวมเดือนนี้ (${active.flaggedPct}%) ต่ำที่สุดในรอบ ${months.length} เดือน`);
  }
  if (categoriesWithTrend.length > 0) {
    const top = categoriesWithTrend[0];
    insights.push(`หมวดที่พบบ่อยที่สุดเดือนนี้: "${top.category}" (${top.count} ภาพ, ${top.pct}% ของภาพที่พบความเสี่ยง)`);
  }
  if (active && active.total === 0) {
    insights.push("ยังไม่มีข้อมูลการตรวจสอบในเดือนนี้");
  }

  if (!active) {
    return <p className="text-sm text-tertiary">ยังไม่มีข้อมูล</p>;
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <span className="inline-block rounded-pill bg-accentSoft text-accent text-xs font-medium px-3.5 py-1.5">
          รายงานสถิติแนวโน้มรายเดือน — สร้างจากข้อมูลจริงอัตโนมัติ
        </span>
        <h1 className="mt-3 text-2xl font-medium text-primary">แนวโน้มจุดที่คลินิกพลาดบ่อยที่สุด</h1>
        <p className="mt-2 text-sm text-secondary max-w-2xl leading-relaxed">
          สร้างจากผลตรวจสอบจริงทั้งหมดในระบบเดือนนั้น ๆ เป็นสถิติภาพรวมเท่านั้น ไม่มีชื่อหรือข้อมูลระบุตัวตนคลินิกใด ๆ
          ปนอยู่ — ใช้ดูภายในทีม และส่งให้ สบส. อ้างอิงประกอบการทบทวนหลักเกณฑ์ได้ทุกเดือนโดยไม่ต้องรอรอบประชุมไตรมาส
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {months.map((m) => (
            <button
              key={m.monthKey}
              onClick={() => setActiveKey(m.monthKey)}
              className={`rounded-pill border border-border px-4 py-2 text-sm transition-colors ${
                m.monthKey === active.monthKey ? "bg-inverse text-onInverse" : "bg-surface text-secondary"
              }`}
            >
              {m.label}
              {m.monthKey === latestKey ? " (ล่าสุด)" : ""}
            </button>
          ))}
        </div>
      </div>

      {insights.length > 0 && (
        <div className="rounded-xl border border-accent bg-accentSoft p-5 flex flex-col gap-2">
          <span className="text-sm font-medium text-accent">ข้อสังเกตสำคัญเดือนนี้ ({active.label})</span>
          {insights.map((ins, i) => (
            <p key={i} className="text-sm text-accent leading-relaxed">
              • {ins}
            </p>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-page p-5">
          <div className="text-2xl font-medium text-primary">{active.total} ชิ้น</div>
          <div className="mt-1.5 text-xs text-secondary">โฆษณาที่ตรวจทั้งหมดในเดือนนี้</div>
        </div>
        <div className="rounded-xl border border-border bg-dangerSoft p-5">
          <div className="text-2xl font-medium text-danger">
            {active.flagged} ชิ้น ({active.flaggedPct}%)
          </div>
          <div className="mt-1.5 text-xs text-danger">พบความเสี่ยงอย่างน้อย 1 จุด</div>
        </div>
        <div className="rounded-xl border border-border bg-page p-5">
          <div className="text-2xl font-medium text-primary truncate" title={categoriesWithTrend[0]?.category}>
            {categoriesWithTrend[0]?.category ?? "—"}
          </div>
          <div className="mt-1.5 text-xs text-secondary">หมวดที่พบบ่อยที่สุดเดือนนี้</div>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-medium text-primary mb-1">
          แนวโน้มอัตราการพบความเสี่ยงโดยรวม {months.length} เดือนล่าสุด
        </h2>
        <p className="text-xs text-tertiary mb-5">คลิกแท่งเพื่อดูรายละเอียดเดือนนั้น</p>
        <div className="flex items-end gap-4 h-28 border-b border-border px-2">
          {months.map((m) => (
            <button
              key={m.monthKey}
              onClick={() => setActiveKey(m.monthKey)}
              className="flex flex-col items-center gap-1.5 flex-1"
            >
              <span className="text-[11px] text-secondary">{m.flaggedPct}%</span>
              <div
                className={`w-full max-w-[44px] rounded-t transition-colors ${
                  m.monthKey === active.monthKey ? "bg-accent" : "bg-border"
                }`}
                style={{ height: `${Math.round((m.flaggedPct / maxFlaggedPct) * 74) + 12}px` }}
              />
            </button>
          ))}
        </div>
        <div className="flex gap-4 px-2 mt-2">
          {months.map((m) => (
            <div key={m.monthKey} className="flex-1 text-center">
              <span
                className={`text-[11px] ${
                  m.monthKey === active.monthKey ? "text-primary font-medium" : "text-tertiary"
                }`}
              >
                {m.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-medium text-primary mb-1">หมวดปัญหาที่พบบ่อยที่สุดเดือนนี้</h2>
        <p className="text-xs text-tertiary mb-1">
          นับจากภาพที่มีอย่างน้อย 1 จุดอยู่ในหมวดนั้น เทียบกับ {active.flagged} ภาพที่พบความเสี่ยงในเดือนนี้
        </p>
        <p className="text-xs text-tertiary mb-4 leading-relaxed">
          หมายเหตุ: ชื่อหมวดมาจากข้อความที่ AI สรุปให้ต่อภาพ ไม่ใช่รายการคงที่ล่วงหน้า — ประเด็นเดียวกันอาจถูกเรียกต่างคำกัน
          เล็กน้อยในบางเดือน จึงเทียบแนวโน้มได้เฉพาะเมื่อใช้คำเดียวกันกับเดือนก่อน (นอกกรณีนี้จะระบุว่า &ldquo;ใหม่ในเดือนนี้&rdquo;
          แทนการเดาแนวโน้ม)
        </p>
        {activeCategories.length === 0 ? (
          <p className="text-sm text-tertiary">ไม่มีข้อมูลหมวดปัญหาในเดือนนี้</p>
        ) : (
          <div className="flex flex-col gap-3">
            {categoriesWithTrend.map((c) => (
              <div key={c.category} className="rounded-xl border border-border bg-page p-5 flex flex-col gap-2.5">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <span className="text-sm font-medium text-primary">{c.category}</span>
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs text-secondary">
                      {c.count} ภาพ ({c.pct}%)
                    </span>
                    {c.trend && (
                      <span
                        className={`text-xs font-medium rounded-pill px-2.5 py-1 ${TREND_CLASSES[c.trend.tone]}`}
                      >
                        {c.trend.label}
                      </span>
                    )}
                  </div>
                </div>
                <div className="w-full h-1.5 rounded-pill bg-border overflow-hidden">
                  <div className="h-full rounded-pill bg-accent" style={{ width: `${c.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-border pt-6">
        <p className="text-xs text-tertiary leading-relaxed max-w-2xl">
          รายงานนี้สร้างจากสถิติการใช้งานจริงของระบบโดยอัตโนมัติ ไม่ผ่านการคัดเลือกหรือแก้ไขโดยทีมงาน ไม่มีข้อมูลที่ระบุ
          ตัวตนคลินิกได้ปนอยู่ในรายงานนี้ไม่ว่าทางใด การรีวิวเชิงลึกพร้อมชุดตัวอย่างทดสอบร่วมกับเจ้าหน้าที่ สบส. ยังทำแยก
          ต่างหากทุกไตรมาสตามปกติ
        </p>
      </div>
    </div>
  );
}
