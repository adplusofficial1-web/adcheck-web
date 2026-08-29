"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CATEGORIES } from "@/lib/issueCategories";

// Checklist of problem categories (see lib/issueCategories.ts:CATEGORIES —
// deliberately NOT lib/issueReports.ts, which also imports the server-only
// `sql` client and would drag a DATABASE_URL-dependent neon() init into
// this client component's browser bundle) — checking a box reveals a
// required detail textarea for that category
// only, so the report the admin receives always has "which problem" and
// "what exactly happened" paired together per item, instead of one big
// free-text box that mixes several unrelated issues together.
export function ReportProblemForm({ contactEmail }: { contactEmail: string | null }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [details, setDetails] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function toggle(id: string) {
    setSelected((s) => ({ ...s, [id]: !s[id] }));
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const chosen = CATEGORIES.filter((c) => selected[c.id]);
    if (chosen.length === 0) {
      setError("กรุณาเลือกหัวข้อปัญหาอย่างน้อย 1 ข้อ");
      return;
    }
    const missingDetail = chosen.find((c) => !(details[c.id] || "").trim());
    if (missingDetail) {
      setError(`กรุณาระบุรายละเอียดสำหรับหัวข้อ "${missingDetail.label}"`);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/report-issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: chosen.map((c) => ({ category: c.id, detail: details[c.id].trim() })),
          message: message.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "ส่งรายงานไม่สำเร็จ");
      setDone(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-lg border border-border p-6 text-center">
        <p className="text-lg font-medium mb-2">✓ ส่งรายงานเรียบร้อยแล้ว</p>
        <p className="text-sm text-secondary mb-6">
          ทีมงานได้รับรายงานปัญหาของคุณแล้ว {contactEmail ? `จะติดต่อกลับที่ ${contactEmail} หากต้องการข้อมูลเพิ่มเติม` : ""}
        </p>
        <button
          onClick={() => router.push("/settings")}
          className="rounded-md bg-inverse text-onInverse px-5 py-2.5 text-sm font-medium"
        >
          กลับไปตั้งค่า
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="rounded-lg border border-border p-5">
        <div className="text-sm font-medium mb-4">เลือกหัวข้อปัญหา (เลือกได้มากกว่า 1 ข้อ)</div>
        <div className="space-y-3">
          {CATEGORIES.map((c) => (
            <div key={c.id} className="border border-border rounded-md p-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(selected[c.id])}
                  onChange={() => toggle(c.id)}
                  className="mt-0.5 rounded border-border"
                />
                <span className="text-sm font-medium">{c.label}</span>
              </label>
              {selected[c.id] && (
                <textarea
                  value={details[c.id] || ""}
                  onChange={(e) => setDetails((d) => ({ ...d, [c.id]: e.target.value }))}
                  rows={3}
                  placeholder="อธิบายรายละเอียด เช่น เกิดขึ้นเมื่อไหร่ ทำอะไรอยู่ตอนนั้น ผลที่เกิดขึ้นคืออะไร"
                  className="mt-3 w-full text-sm rounded-md px-3 py-2 outline-none border border-border bg-page"
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border p-5">
        <label className="block text-sm font-medium mb-2">ข้อความเพิ่มเติม (ไม่บังคับ)</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          placeholder="รายละเอียดอื่นๆ ที่อยากแจ้งเพิ่มเติม"
          className="w-full text-sm rounded-md px-3 py-2 outline-none border border-border bg-page"
        />
      </div>

      {error && <div className="text-sm text-danger">{error}</div>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-inverse text-onInverse px-5 py-3 text-sm font-medium disabled:opacity-50"
      >
        {submitting ? "กำลังส่ง..." : "ส่งรายงานปัญหา"}
      </button>
    </form>
  );
}
