"use client";

import { useState } from "react";

export function FlagDetail({
  quotedText,
  category,
  legalRef,
  severity,
  confidenceLevel,
  topic,
  detailedExplanation,
}: {
  quotedText: string;
  category?: string | null;
  legalRef?: string | null;
  severity: string;
  confidenceLevel?: string | null;
  topic?: string | null;
  detailedExplanation?: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-page rounded-md p-3 mb-2 text-sm">
      <div className="flex items-center justify-between mb-1 gap-2">
        <span className="font-medium">&quot;{quotedText}&quot;</span>
        <span
          className={`rounded-pill px-2 py-0.5 text-xs font-medium shrink-0 ${
            severity === "ห้ามเด็ดขาด" ? "bg-dangerSoft text-danger" : "bg-warningSoft text-warning"
          }`}
        >
          {severity}
        </span>
      </div>
      {/* FIX (bug audit — Low): this used to always render "{category} ·
          {legalRef}" — when a flag has neither (both null/undefined), that
          collapsed to a bare "·" with no explanatory text. Only join with
          "·" when both are present, and fall back to a plain-language note
          when neither is. */}
      {category || legalRef ? (
        <div className="text-secondary text-xs mb-2">
          {category}
          {category && legalRef ? " · " : ""}
          {legalRef}
        </div>
      ) : (
        <div className="text-secondary text-xs mb-2">ไม่มีข้อมูลหมวดหมู่หรืออ้างอิงกฎหมายสำหรับข้อความนี้</div>
      )}
      {topic && <div className="text-sm font-medium mb-1">{topic}</div>}
      {detailedExplanation && (
        <>
          {open && (
            <div className="mb-1 space-y-2">
              {detailedExplanation
                .split(/\n\s*\n/)
                .map((s) => s.trim())
                .filter(Boolean)
                .map((paragraph, i) => {
                  const fixLabel = "วิธีแก้ไข:";
                  const isFix = paragraph.startsWith(fixLabel);
                  return (
                    <p key={i} className="text-xs text-secondary leading-relaxed">
                      {isFix ? (
                        <>
                          <span className="font-medium text-primary">{fixLabel}</span>
                          {paragraph.slice(fixLabel.length)}
                        </>
                      ) : (
                        paragraph
                      )}
                    </p>
                  );
                })}
            </div>
          )}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="text-xs text-accent underline"
          >
            {open ? "ย่อ ▴" : "อธิบายเพิ่มเติม ▾"}
          </button>
        </>
      )}
    </div>
  );
}
