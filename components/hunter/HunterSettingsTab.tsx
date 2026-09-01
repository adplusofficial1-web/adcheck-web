"use client";

import { useCallback, useEffect, useState } from "react";

// /hunter's "ตั้งค่า" tab — personal details + tax-document info. Payout
// method lives on the ค่าคอมมิชชั่น tab instead (components/hunter/HunterCommissionTab.tsx)
// since it's saved alongside that tab's own "บันทึกช่องทางรับเงิน" button;
// both PATCH the same /api/hunter/settings endpoint, which merges whichever
// fields are present in the request (see that route).
//
// Profile picture (2569-09-01, per user request "หน้าตั้งค่าให้เพิ่มรูป
// ประจำตัวได้"): reuses the exact same client-side pattern as the clinic
// account's own avatar upload (components/settings/SettingsClient.tsx's
// ProfileModal) — read the file as a data: URL with FileReader, preview it
// immediately, and only send it to the server (as avatarBase64) once
// "บันทึกการตั้งค่า" is pressed. See migrations/015_hunter_avatar.sql and
// app/api/hunter/settings/route.ts for the column + validation this feeds.
// onAvatarChange lets the parent (HunterShell) update the small avatar it
// shows in the header the moment a save succeeds, without a full reload.

type Settings = {
  name: string;
  email: string;
  phone: string | null;
  line_id: string | null;
  tax_id: string | null;
  tax_address: string | null;
  avatar_url: string | null;
};

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function HunterSettingsTab({ onAvatarChange }: { onAvatarChange?: (url: string | null) => void }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [lineId, setLineId] = useState("");
  const [taxId, setTaxId] = useState("");
  const [taxAddress, setTaxAddress] = useState("");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarChanged, setAvatarChanged] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/hunter/settings", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "โหลดข้อมูลไม่สำเร็จ");
      setSettings(data.settings);
      setName(data.settings?.name ?? "");
      setPhone(data.settings?.phone ?? "");
      setLineId(data.settings?.line_id ?? "");
      setTaxId(data.settings?.tax_id ?? "");
      setTaxAddress(data.settings?.tax_address ?? "");
      setAvatarPreview(data.settings?.avatar_url ?? null);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "โหลดข้อมูลไม่สำเร็จ");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onAvatarFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setAvatarLoading(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      setAvatarPreview(dataUrl);
      setAvatarChanged(true);
      setSaved(false);
    } finally {
      setAvatarLoading(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/hunter/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phone,
          lineId,
          taxId,
          taxAddress,
          ...(avatarChanged && avatarPreview ? { avatarBase64: avatarPreview } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        window.alert(data?.error || "บันทึกไม่สำเร็จ");
        return;
      }
      setSettings(data.settings);
      setAvatarPreview(data.settings?.avatar_url ?? null);
      setAvatarChanged(false);
      onAvatarChange?.(data.settings?.avatar_url ?? null);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!settings) return <p className="text-sm text-secondary">กำลังโหลด…</p>;

  return (
    <div>
      <p className="text-sm text-secondary max-w-2xl">รายละเอียดส่วนตัวและข้อมูลสำหรับออกเอกสารค่าคอมมิชชั่น</p>

      <div className="mt-5 rounded-lg border border-border bg-surface p-4" style={{ maxWidth: 480 }}>
        <span className="text-sm font-medium text-primary">ข้อมูลส่วนตัว</span>
        <div className="mt-3.5 flex items-center gap-4">
          {avatarPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarPreview} alt="" className="w-16 h-16 rounded-full object-cover shrink-0" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-accentSoft text-accent flex items-center justify-center text-lg font-medium shrink-0">
              {(name || settings.name || "?").trim()[0]?.toUpperCase() || "?"}
            </div>
          )}
          <label className="text-xs font-medium border border-border rounded-md px-3 py-2 cursor-pointer hover:bg-page whitespace-nowrap">
            {avatarLoading ? "กำลังโหลด…" : "เปลี่ยนรูปประจำตัว"}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => onAvatarFile(e.target.files)} />
          </label>
        </div>
        <div className="mt-3.5 flex flex-col gap-3">
          <div>
            <label className="block text-xs text-secondary mb-1.5">ชื่อ-นามสกุล</label>
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSaved(false);
              }}
              className="w-full rounded-md border border-border bg-page px-3 py-2 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>
          <div>
            <label className="block text-xs text-secondary mb-1.5">เบอร์โทรศัพท์</label>
            <input
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setSaved(false);
              }}
              placeholder="081-234-5678"
              className="w-full rounded-md border border-border bg-page px-3 py-2 text-sm text-primary placeholder:text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>
          <div>
            <label className="block text-xs text-secondary mb-1.5">LINE ID</label>
            <input
              value={lineId}
              onChange={(e) => {
                setLineId(e.target.value);
                setSaved(false);
              }}
              placeholder="@somchai"
              className="w-full rounded-md border border-border bg-page px-3 py-2 text-sm text-primary placeholder:text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>
          <div>
            <label className="block text-xs text-secondary mb-1.5">อีเมลที่ใช้เข้าสู่ระบบ</label>
            <div className="w-full rounded-md bg-page px-3 py-2 text-sm text-tertiary">{settings.email}</div>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-border bg-surface p-4" style={{ maxWidth: 480 }}>
        <span className="text-sm font-medium text-primary">ข้อมูลสำหรับออกเอกสารภาษี</span>
        <p className="mt-1.5 text-xs text-secondary">ใช้สำหรับออกหนังสือรับรองหัก ณ ที่จ่าย เมื่อมีการโอนค่าคอมมิชชั่น</p>
        <div className="mt-3.5 flex flex-col gap-3">
          <div>
            <label className="block text-xs text-secondary mb-1.5">เลขประจำตัวผู้เสียภาษี 13 หลัก</label>
            <input
              value={taxId}
              onChange={(e) => {
                setTaxId(e.target.value);
                setSaved(false);
              }}
              placeholder="x-xxxx-xxxxx-xx-x"
              className="w-full rounded-md border border-border bg-page px-3 py-2 text-sm text-primary placeholder:text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>
          <div>
            <label className="block text-xs text-secondary mb-1.5">ที่อยู่สำหรับออกเอกสาร</label>
            <textarea
              value={taxAddress}
              onChange={(e) => {
                setTaxAddress(e.target.value);
                setSaved(false);
              }}
              placeholder="บ้านเลขที่ ถนน ตำบล/แขวง อำเภอ/เขต จังหวัด รหัสไปรษณีย์"
              rows={3}
              className="w-full rounded-md border border-border bg-page px-3 py-2 text-sm text-primary placeholder:text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none"
            />
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2.5">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-md bg-inverse text-onInverse px-3.5 py-1.5 text-sm font-medium disabled:opacity-40"
        >
          {saving ? "กำลังบันทึก…" : "บันทึกการตั้งค่า"}
        </button>
        {saved && <span className="text-xs text-accent">บันทึกแล้ว ✓</span>}
      </div>
    </div>
  );
}
