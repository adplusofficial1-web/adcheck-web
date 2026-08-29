"use client";

import { useEffect, useRef, useState } from "react";
import type { ComplianceRuleMatch } from "@/lib/complianceRules";
import { formatThaiDateTime, wasEdited } from "@/lib/formatDateTime";

// Small "ดาวน์โหลดเอกสาร" menu — one button per row that opens a two-item
// choice (PDF / DOCX) rather than two separate buttons, since a row can
// always produce both regardless of how it was added (typed text or an
// uploaded PDF/DOCX/TXT/MD — see lib/complianceRuleDocx.ts's header
// comment for why generation is on-demand from `content` rather than
// reusing the "ดาวน์โหลดไฟล์ต้นฉบับ" link next to it, which only exists for
// upload-sourced rows and serves the original bytes as-is).
function DownloadMenu({ ruleId }: { ruleId: string }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-pill bg-accentSoft text-accent px-2.5 py-0.5 text-xs hover:underline"
      >
        ดาวน์โหลดเอกสาร ▾
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-10 w-36 overflow-hidden rounded-md border border-border bg-surface shadow-lg">
          <a
            href={`/admin/knowledge-base/${ruleId}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="block px-3 py-2 text-xs text-primary hover:bg-page"
            onClick={() => setOpen(false)}
          >
            ไฟล์ PDF
          </a>
          <a
            href={`/api/admin/knowledge-base/${ruleId}/docx`}
            className="block px-3 py-2 text-xs text-primary hover:bg-page border-t border-border"
            onClick={() => setOpen(false)}
          >
            ไฟล์ DOCX
          </a>
        </div>
      )}
    </div>
  );
}

type Props = { initialRules: ComplianceRuleMatch[] };

// Client-side manager for the compliance knowledge base: search box (same
// trigram ranking reviewImage.ts uses, so an admin can preview "what would
// this ad caption match?"), an add form with two input modes (type text /
// upload a file), and the list itself with inline edit, active/always-on
// toggles, and delete.
//
// Deliberately kept as one file rather than split into many small
// components — the whole feature is small enough (one table, no nested
// routing) that splitting it would just add indirection without a real
// reuse benefit anywhere else in the app.
export function KnowledgeBaseManager({ initialRules }: Props) {
  const [rules, setRules] = useState<ComplianceRuleMatch[]>(initialRules);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function refetch(q: string) {
    setSearching(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/knowledge-base${q ? `?q=${encodeURIComponent(q)}` : ""}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "ค้นหาไม่สำเร็จ");
      setRules(data.rules);
    } catch (e: any) {
      setError(e.message || "เกิดข้อผิดพลาด");
    } finally {
      setSearching(false);
    }
  }

  function onQueryChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => refetch(value), 300);
  }

  return (
    <div className="space-y-8">
      <AddRuleForm onCreated={() => refetch(query)} />

      <div>
        <label className="block text-sm font-medium text-primary mb-2">
          ค้นหาตามบริบท (ตัวอย่าง: ลองพิมพ์แคปชั่นโฆษณาเพื่อดูว่าจะจับคู่กับกฎข้อไหน)
        </label>
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="เช่น ทำเลเซอร์แล้วหายขาด 100% การันตีผล"
          className="w-full rounded-md border border-border bg-surface px-4 py-2.5 text-sm text-primary placeholder:text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/30"
        />
        {searching && <p className="mt-1 text-xs text-tertiary">กำลังค้นหา...</p>}
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      </div>

      <ul className="space-y-3">
        {rules.length === 0 && (
          <li className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-tertiary">
            {query ? "ไม่พบรายการที่ตรงกับคำค้นหา" : "ยังไม่มีข้อมูลในคลังความรู้ — เพิ่มรายการแรกด้านบน"}
          </li>
        )}
        {rules.map((rule) => (
          <RuleRow key={rule.id} rule={rule} showScore={Boolean(query)} onChanged={() => refetch(query)} />
        ))}
      </ul>
    </div>
  );
}

function AddRuleForm({ onCreated }: { onCreated: () => void }) {
  const [mode, setMode] = useState<"text" | "file">("text");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [content, setContent] = useState("");
  const [alwaysInclude, setAlwaysInclude] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function reset() {
    setTitle("");
    setCategory("");
    setContent("");
    setAlwaysInclude(false);
    setFile(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      let res: Response;
      if (mode === "text") {
        if (!title.trim() || !content.trim()) {
          throw new Error("ต้องระบุหัวข้อและเนื้อหา");
        }
        res = await fetch("/api/admin/knowledge-base", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, category, content, alwaysInclude }),
        });
      } else {
        if (!file) throw new Error("กรุณาเลือกไฟล์");
        const form = new FormData();
        form.append("file", file);
        if (title.trim()) form.append("title", title.trim());
        if (category.trim()) form.append("category", category.trim());
        form.append("alwaysInclude", String(alwaysInclude));
        res = await fetch("/api/admin/knowledge-base/upload", { method: "POST", body: form });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "บันทึกไม่สำเร็จ");
      if (data.warning) setNotice(data.warning);
      reset();
      onCreated();
    } catch (e: any) {
      setError(e.message || "เกิดข้อผิดพลาด");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-border bg-surface p-5">
      <div className="flex items-center gap-1 p-1 w-fit rounded-pill bg-page border border-border mb-5">
        {(["text", "file"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-pill px-4 py-1.5 text-xs font-medium transition-colors ${
              mode === m ? "bg-inverse text-onInverse" : "text-secondary"
            }`}
          >
            {m === "text" ? "พิมพ์/วางข้อความ" : "อัพขลดไฟล์ (PDF/DOCX/TXT)"}
          </button>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-secondary mb-1">
            หัวข้อ {mode === "file" && "(เว้นว่างได้ จะใช้ชื่อไฟล์แทน)"}
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="เช่น มาตรา 38 ห้ามโฆษณาโอ้อวดเกินจริง"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-primary placeholder:text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-secondary mb-1">หมวดหมู่ (ไม่บังคับ)</label>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="เช่น พ.ร.บ.สถานพยาบาล, PDPA, ประกาศ อย."
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-primary placeholder:text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        </div>
      </div>

      {mode === "text" ? (
        <div className="mt-4">
          <label className="block text-xs font-medium text-secondary mb-1">เนื้อหากฎหมาย/ระเบียบ</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={5}
            placeholder="พิมพ์หรือวางเนื้อหากฎหมาย/ข้อกำหนดที่ต้องการให้ AI ใช้อ้างอิงตอนตรวจภาพ"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-primary placeholder:text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        </div>
      ) : (
        <div className="mt-4">
          <label className="block text-xs font-medium text-secondary mb-1">ไฟล์เอกสาร</label>
          <input
            type="file"
            accept=".pdf,.docx,.txt,.md"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full text-sm text-secondary file:mr-3 file:rounded-md file:border-0 file:bg-accentSoft file:text-accent file:px-3 file:py-2 file:text-xs file:font-medium"
          />
          <p className="mt-1 text-xs text-tertiary">
            ระบบจะแตกข้อความจากไฟล์อัตโนมัติแล้วเก็บเป็นข้อความล้วน หางไฟล์เป็น PDF สแกน/รูปภาพที่ไม่มีข้อความ
            จะแตกไม่สำเร็จ กรุณาพิมพ์ข้อความแทน
          </p>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-4">
        <label className="flex items-center gap-2 text-sm text-secondary">
          <input
            type="checkbox"
            checked={alwaysInclude}
            onChange={(e) => setAlwaysInclude(e.target.checked)}
            className="rounded border-border"
          />
          ใช้ตรวจทุกภาพเสมอ (ไม่ี้องรอผลค้นหาตามบริบท)
        </label>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-inverse text-onInverse px-5 py-2 text-sm font-medium disabled:opacity-50"
        >
          {submitting ? "กำลังบันทึก..." : "เพิ่มเข้าคลังความรู้"}
        </button>
      </div>

      {error && <p className="mt-3 text-xs text-danger">{error}</p>}
      {notice && <p className="mt-3 text-xs text-warning">{notice}</p>}
    </form>
  );
}

function RuleRow({
  rule,
  showScore,
  onChanged,
}: {
  rule: ComplianceRuleMatch;
  showScore: boolean;
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(rule.title);
  const [draftCategory, setDraftCategory] = useState(rule.category ?? "");
  const [draftContent, setDraftContent] = useState(rule.content);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/knowledge-base/${rule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "บันทึกไม่สำเร็จ");
      onChanged();
    } catch (e: any) {
      setError(e.message || "เกิดข้อผิดพลาด");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`ลบรายการ "${rule.title}" ออกจากคลังความรู้ถาวรหรือไม่?`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/knowledge-base/${rule.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "ลบไม่สำเร็จ");
      onChanged();
    } catch (e: any) {
      setError(e.message || "เกิดข้อผิดพลาด");
      setBusy(false);
    }
  }

  async function saveEdit() {
    await patch({ title: draftTitle, category: draftCategory || null, content: draftContent });
    setEditing(false);
  }

  return (
    <li className={`rounded-lg border border-border bg-surface p-4 ${!rule.is_active ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {editing ? (
              <input
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                className="rounded border border-border px-2 py-1 text-sm font-medium text-primary"
              />
            ) : (
              <span className="text-sm font-medium text-primary">{rule.title}</span>
            )}
            {rule.category && (
              <span className="rounded-pill bg-accentSoft text-accent px-2.5 py-0.5 text-xs">
                {rule.category}
              </span>
            )}
            {rule.always_include && (
              <span className="rounded-pill bg-warningSoft text-warning px-2.5 py-0.5 text-xs">ใช้เสมอ</span>
            )}
            <span className="rounded-pill bg-page border border-border text-tertiary px-2.5 py-0.5 text-xs">
              {rule.source_type === "upload" ? `ไฟล์: ${rule.source_filename ?? ""}` : "พิมพ์เอง"}
            </span>
            {rule.has_file && (
              <a
                href={`/api/admin/knowledge-base/${rule.id}/file`}
                className="rounded-pill bg-accentSoft text-accent px-2.5 py-0.5 text-xs hover:underline"
              >
                ดาวน์โหลดไฟล์ต้นฉบับ
              </a>
            )}
            <DownloadMenu ruleId={rule.id} />
            {!rule.is_active && (
              <span className="rounded-pill bg-dangerSoft text-danger px-2.5 py-0.5 text-xs">ปิดใช้งาน</span>
            )}
            {showScore && (
              <span className="text-xs text-tertiary">คะแนนความเกี่ยวข้อง {rule.score.toFixed(2)}</span>
            )}
          </div>

          {editing ? (
            <div className="mt-2 space-y-2">
              <input
                value={draftCategory}
                onChange={(e) => setDraftCategory(e.target.value)}
                placeholder="หมวดหมู่"
                className="w-full rounded border border-border px-2 py-1 text-xs text-secondary"
              />
              <textarea
                value={draftContent}
                onChange={(e) => setDraftContent(e.target.value)}
                rows={5}
                className="w-full rounded border border-border px-2 py-1.5 text-sm text-primary"
              />
            </div>
          ) : (
            <p className={`mt-1.5 text-sm text-secondary whitespace-pre-wrap ${expanded ? "" : "line-clamp-2"}`}>
              {rule.content}
            </p>
          )}
          {!editing && rule.content.length > 120 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 text-xs text-accent hover:underline"
            >
              {expanded ? "ย่อ" : "ดูเนื้อหาเต็ม"}
            </button>
          )}
          {!editing && (
            <p className="mt-2 text-xs text-tertiary">
              เพิ่มเมื่อ {formatThaiDateTime(rule.created_at)}
              {wasEdited(rule.created_at, rule.updated_at) && ` · แก้ไขล่าสุด ${formatThaiDateTime(rule.updated_at)}`}
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <label className="flex items-center gap-1.5 text-xs text-secondary">
            <input
              type="checkbox"
              checked={rule.is_active}
              disabled={busy}
              onChange={(e) => patch({ isActive: e.target.checked })}
              className="rounded border-border"
            />
            เปิดใช้งาน
          </label>
          <div className="flex items-center gap-2">
            {editing ? (
              <>
                <button
                  type="button"
                  onClick={saveEdit}
                  disabled={busy}
                  className="text-xs font-medium text-accent hover:underline disabled:opacity-50"
                >
                  บันทึก
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="text-xs text-secondary hover:underline"
                >
                  ยกเลิก
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="text-xs text-secondary hover:underline"
                >
                  แก้ไข
                </button>
                <button
                  type="button"
                  onClick={remove}
                  disabled={busy}
                  className="text-xs text-danger hover:underline disabled:opacity-50"
                >
                  ลบ
                </button>
              </>
            )}
          </div>
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </li>
  );
}
