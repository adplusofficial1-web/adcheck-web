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
      <div className="text-secondary text-xs mb-2">
        {category} · {legalRef} · ความมั่นใจ: {confidenceLevel}
      </div>
      {topic && <div className="text-sm font-medium mb-1">{topic}</div>}
      {detailedExplanation && (
        <>
          {open && <p className="text-xs text-secondary leading-relaxed mb-1">{detailedExplanation}</p>}
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
