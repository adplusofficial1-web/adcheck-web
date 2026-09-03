"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// "+ เพิ่มคลินิก" button + modal on /agency/dashboard. Posts to
// POST /api/agency/clinics (see lib/agency.ts:addChildClinic) then
// router.refresh() so the server-rendered clinic list picks up the new row
// without a full page reload.
export function AddClinicModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setName("");
    setEmail("");
    setError(null);
  }

  async function submit() {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/agency/clinics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "เกิดข้อผิดพลาด");
      router.refresh();
      close();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-md bg-inverse text-onInverse px-4 py-2 text-sm font-medium shrink-0"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        เพิ่มคลินิก
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-inverse/40">
          <div className="w-full max-w-md rounded-lg p-6 bg-surface border border-border">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-medium">เพิ่มคลินิกใหม่ในเครือข่าย</h2>
              <button onClick={close} className="text-sm text-secondary">
                ✕
              </button>
            </div>
            <div className="mb-4">
              <label className="block text-xs mb-1.5 text-secondary">ชื่อคลินิก</label>
              <input
                className="w-full text-sm rounded-md px-3 py-2 outline-none border border-border bg-page"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="เช่น คลินิกความงามสยาม"
              />
            </div>
            <div className="mb-2">
              <label className="block text-xs mb-1.5 text-secondary">อีเมลติดต่อ (ถ้ามี)</label>
              <input
                className="w-full text-sm rounded-md px-3 py-2 outline-none border border-border bg-page"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contact@clinic.com"
              />
            </div>
            <p className="text-xs mt-2 mb-4 text-tertiary">
              เพิ่มคลินิกได้โดยไม่ต้องชำระแพ็กเกจก่อน — เลือกแพ็กเกจและเริ่มอัปโหลดได้ภายหลังจากหน้าตั้งค่า
            </p>
            {error && <div className="text-sm text-danger mb-3">{error}</div>}
            <button
              onClick={submit}
              disabled={!name.trim() || saving}
              className="w-full rounded-md py-2.5 text-sm font-medium bg-inverse text-onInverse disabled:opacity-40"
            >
              {saving ? "กำลังเพิ่ม..." : "เพิ่มคลินิก"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
