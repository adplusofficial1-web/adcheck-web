"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ChildClinic } from "@/lib/agency";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length > 1 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}

// One clinic's editable info + plan/credit summary on /agency/settings.
// Saves via PATCH /api/agency/clinics/[id] (ownership-checked server-side)
// — billing itself is NOT handled here (per-clinic top-up goes through the
// existing /checkout?business=<id> flow, same as a clinic buying for
// itself) so this card only edits the clinic's profile fields.
export function ClinicSettingsCard({
  clinic,
  checksThisMonth,
}: {
  clinic: ChildClinic;
  checksThisMonth: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    name: clinic.name,
    contact_email: clinic.contact_email || "",
    license_number: clinic.license_number || "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/agency/clinics/${clinic.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
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

  return (
    <section className="border border-border rounded-lg p-6">
      <div className="flex items-center gap-5 mb-5">
        <div className="w-16 h-16 rounded-full flex items-center justify-center text-lg font-medium shrink-0 bg-accentSoft text-accent">
          {initials(clinic.name)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-lg font-medium truncate">{clinic.name}</div>
          <div className="text-sm truncate text-secondary">
            {clinic.contact_email || "ยังไม่มีอีเมลติดต่อ"} · {clinic.plan_name || "ยังไม่มีแพ็กเกจ"}
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
          <button
            onClick={() => setEditing(true)}
            className="shrink-0 rounded-md px-3.5 py-2 text-xs font-medium border border-border"
          >
            แก้ไข
          </button>
        )}
      </div>

      {error && <div className="text-sm text-danger mb-4">{error}</div>}

      <div className="text-sm font-medium mb-4">ข้อมูลคลินิก</div>
      {editing ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-xs mb-1.5 text-secondary">ชื่อคลินิก</label>
            <input
              className="w-full text-sm rounded-md px-3 py-2 outline-none border border-border bg-page"
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs mb-1.5 text-secondary">อีเมลติดต่อ</label>
            <input
              className="w-full text-sm rounded-md px-3 py-2 outline-none border border-border bg-page"
              value={draft.contact_email}
              onChange={(e) => setDraft((d) => ({ ...d, contact_email: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs mb-1.5 text-secondary">เลขที่ใบอนุญาตสถานพยาบาล</label>
            <input
              className="w-full text-sm rounded-md px-3 py-2 outline-none border border-border bg-page"
              value={draft.license_number}
              onChange={(e) => setDraft((d) => ({ ...d, license_number: e.target.value }))}
            />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div>
            <div className="text-xs mb-1 text-tertiary">ชื่อคลินิก</div>
            <div className="text-sm">{clinic.name}</div>
          </div>
          <div>
            <div className="text-xs mb-1 text-tertiary">อีเมลติดต่อ</div>
            <div className="text-sm">{clinic.contact_email || "—"}</div>
          </div>
          <div>
            <div className="text-xs mb-1 text-tertiary">เลขที่ใบอนุญาตสถานพยาบาล</div>
            <div className="text-sm">{clinic.license_number || "—"}</div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3 pt-4 border-t border-border">
        <div>
          <span className="inline-block text-xs font-medium px-3 py-1 mb-2 rounded-pill bg-accentSoft text-accent">
            {clinic.plan_name || "ยังไม่มีแพ็กเกจ"}
          </span>
          <div className="text-sm font-medium">
            {clinic.price_thb ? `${Number(clinic.price_thb).toLocaleString()} บาท / รอบ` : "—"}
            {clinic.monthly_image_credits ? ` · ${clinic.monthly_image_credits} เครดิต/รอบ` : ""}
          </div>
          <div className="text-xs text-secondary mt-1">เครดิตที่ใช้ไป {checksThisMonth} ครั้ง</div>
        </div>
        <Link
          href={`/checkout?business=${clinic.id}`}
          className="shrink-0 rounded-md px-4 py-2.5 text-sm font-medium bg-inverse text-onInverse"
        >
          ซื้อ/เติมแพ็กเกจให้คลินิกนี้ →
        </Link>
      </div>
    </section>
  );
}
