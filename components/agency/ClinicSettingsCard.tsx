"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ChildClinic } from "@/lib/agency";
import { SPECIALTY_OPTIONS, SPECIALTY_LABEL } from "@/lib/specialties";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length > 1 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}

// Same pattern as components/settings/SettingsClient.tsx's own profile-photo
// upload — read the file client-side into a data: URL and send it up as
// JSON, no separate upload endpoint/object storage involved.
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// One clinic's editable info + this-month usage on /agency/settings.
// Saves via PATCH /api/agency/clinics/[id] (ownership-checked server-side).
// There's no per-clinic billing any more — every clinic in the network
// draws from the agency's own shared credit pool (see lib/agency.ts's
// hasActiveAgencyPlan comment), so this card only edits the clinic's
// profile fields and shows how much of the shared pool it used this month.
export function ClinicSettingsCard({
  clinic,
  checksThisMonth,
}: {
  clinic: ChildClinic;
  checksThisMonth?: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    name: clinic.name,
    contact_email: clinic.contact_email || "",
    license_number: clinic.license_number || "",
    specialty: clinic.specialty || "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(clinic.avatar_url);
  const [loadingFile, setLoadingFile] = useState(false);

  async function onFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setLoadingFile(true);
    try {
      setAvatarPreview(await fileToBase64(file));
    } finally {
      setLoadingFile(false);
    }
  }

  async function save() {
    // FIX (bug audit — Low): "add clinic" already blocks an empty name
    // client-side, but this "edit" form didn't — the server still
    // rejects it (see app/api/agency/clinics/[id]/route.ts's `name.length
    // === 0` check), so the only effect was an avoidable round-trip and
    // an error message after the fact instead of before submitting.
    if (!draft.name.trim()) {
      setError("ชื่อคลินิกห้ามเว้นว่าง");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/agency/clinics/${clinic.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...draft,
          avatarBase64: avatarPreview !== clinic.avatar_url ? avatarPreview : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "เกิดข้อผิดพลาด");
      setEditing(false);
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 1800);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  // Permanently removes this clinic from the network — the API cascades
  // the delete to every submission, review, transaction, and payment
  // method tied to it (see the FK constraints on those tables), so this is
  // irreversible. That's why it needs the explicit "ยืนยันลบคลินิก" tap in
  // the banner below rather than deleting straight from the trash icon.
  // On success there's nothing to reset back — router.refresh() re-fetches
  // the clinic list from the server without this row, so this component
  // just unmounts.
  async function remove() {
    setRemoving(true);
    setError(null);
    try {
      const res = await fetch(`/api/agency/clinics/${clinic.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "เกิดข้อผิดพลาด");
      router.refresh();
    } catch (e: any) {
      setError(e.message);
      setRemoving(false);
    }
  }

  return (
    <section className="border border-border rounded-lg p-6">
      <div className="flex items-center gap-5 mb-5">
        {avatarPreview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarPreview}
            alt=""
            className="w-16 h-16 rounded-full object-cover shrink-0"
          />
        ) : (
          <div className="w-16 h-16 rounded-full flex items-center justify-center text-lg font-medium shrink-0 bg-accentSoft text-accent">
            {initials(clinic.name)}
          </div>
        )}
        {editing && (
          <label className="shrink-0 text-xs font-medium border border-border rounded-md px-3 py-2 cursor-pointer hover:bg-page -ml-2">
            {loadingFile ? "กำลังโหลด..." : "เปลี่ยนรูป"}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files)} />
          </label>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-lg font-medium truncate">{clinic.name}</div>
          <div className="text-sm truncate text-secondary">
            {clinic.contact_email || "ยังไม่มีอีเมลติดต่อ"}
          </div>
        </div>
        {saved ? (
          <span className="shrink-0 text-xs font-medium text-accent">✓ บันทึกแล้ว</span>
        ) : editing ? (
          <button
            onClick={save}
            disabled={saving}
            className="shrink-0 rounded-md px-3.5 py-2 text-xs font-medium bg-inverse text-onInverse disabled:opacity-50"
          >
            {saving ? "กำลังบันทึก..." : "บันทึก"}
          </button>
        ) : (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setEditing(true)}
              className="rounded-md px-3.5 py-2 text-xs font-medium border border-border"
            >
              แก้ไข
            </button>
            <button
              onClick={() => setDeleting(true)}
              aria-label="ลบคลินิก"
              title="ลบคลินิก"
              className="w-9 h-9 rounded-md border border-dangerSoft text-danger flex items-center justify-center hover:bg-dangerSoft text-base leading-none"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {deleting && (
        <div className="rounded-md bg-dangerSoft px-4 py-3 mb-5 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-danger">
            ลบคลินิก <span className="font-medium">{clinic.name}</span> ใช่ไหม? ประวัติการตรวจ ครดิต และข้อมูลทั้งหมดของ
            คลินิกนี้จะถูกลบถาวร กู้คืนไม่ได้
          </p>
          <div className="flex gap-2 shrink-0">
            <button
              disabled={removing}
              onClick={remove}
              className="rounded-md bg-danger text-onInverse px-3.5 py-2 text-xs font-medium disabled:opacity-50"
            >
              {removing ? "กำลังลบ..." : "ยืนยันลบคลินิก"}
            </button>
            <button
              disabled={removing}
              onClick={() => setDeleting(false)}
              className="rounded-md border border-border px-3.5 py-2 text-xs disabled:opacity-50"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      {error && <div className="text-sm text-danger mb-4">{error}</div>}

      <div className="text-sm font-medium mb-4">ข้อมูลคลินิก</div>
      {editing ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div className="flex flex-col">
            {/* FIX (layout): every label sits in a fixed 2-line-tall box now
                (min-h-[2rem] = 2 lines at text-xs) so a long label like
                "เลขที่ใบอนุญาตสถานพยาบาล" wrapping to 2 lines doesn't push
                just its own input down out of alignment with the other 3
                fields in the same row — all four inputs now start at the
                same y position regardless of label length. */}
            <label className="flex items-end min-h-[2rem] text-xs mb-1.5 text-secondary">ชื่อคลินิก</label>
            <input
              className="w-full text-sm rounded-md px-3 py-2 outline-none border border-border bg-page"
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            />
          </div>
          <div className="flex flex-col">
            <label className="flex items-end min-h-[2rem] text-xs mb-1.5 text-secondary">อีเมลติดต่อ</label>
            <input
              className="w-full text-sm rounded-md px-3 py-2 outline-none border border-border bg-page"
              value={draft.contact_email}
              onChange={(e) => setDraft((d) => ({ ...d, contact_email: e.target.value }))}
            />
          </div>
          <div className="flex flex-col">
            <label className="flex items-end min-h-[2rem] text-xs mb-1.5 text-secondary">เลขที่ใบอนุญาตสถานพยาบาล</label>
            <input
              className="w-full text-sm rounded-md px-3 py-2 outline-none border border-border bg-page"
              value={draft.license_number}
              onChange={(e) => setDraft((d) => ({ ...d, license_number: e.target.value }))}
            />
          </div>
          <div className="flex flex-col">
            <label className="flex items-end min-h-[2rem] text-xs mb-1.5 text-secondary">สาขาความเชี่ยวชาญ</label>
            <select
              className="w-full text-sm rounded-md px-3 py-2 outline-none border border-border bg-page"
              value={draft.specialty}
              onChange={(e) => setDraft((d) => ({ ...d, specialty: e.target.value }))}
            >
              <option value="">ยังไม่ระบุ</option>
              {SPECIALTY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div className="flex flex-col">
            {/* Same fixed-height label box as the editing grid above, so the
                read-only grid's value line stays aligned across all 4
                columns too. */}
            <div className="flex items-end min-h-[2rem] text-xs mb-1 text-tertiary">ชื่อคลินิก</div>
            <div className="text-sm">{clinic.name}</div>
          </div>
          <div className="flex flex-col">
            <div className="flex items-end min-h-[2rem] text-xs mb-1 text-tertiary">อีเมลติดต่อ</div>
            <div className="text-sm">{clinic.contact_email || "—"}</div>
          </div>
          <div className="flex flex-col">
            <div className="flex items-end min-h-[2rem] text-xs mb-1 text-tertiary">เลขที่ใบอนุญาตสถานพยาบาล</div>
            <div className="text-sm">{clinic.license_number || "—"}</div>
          </div>
          <div className="flex flex-col">
            <div className="flex items-end min-h-[2rem] text-xs mb-1 text-tertiary">สาขาความเชี่ยวชาญ</div>
            <div className="text-sm">
              {clinic.specialty ? SPECIALTY_LABEL[clinic.specialty] || clinic.specialty : "—"}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3 pt-4 border-t border-border">
        <div>
          <span className="inline-block text-xs font-medium px-3 py-1 mb-2 rounded-pill bg-accentSoft text-accent">
            ใช้เครดิตรวมจากแพ็กเกจองค์กร
          </span>
          <div className="text-xs text-secondary">
            {checksThisMonth !== undefined ? `ตรวจแล้วเดือนนี้ ${checksThisMonth} ครั้ง` : null}
          </div>
        </div>
      </div>
    </section>
  );
}
