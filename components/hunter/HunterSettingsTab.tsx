"use client";

import { useCallback, useEffect, useState } from "react";

// /hunter's "ตั้งค่า" tab — personal details + tax-document info. Payout
// method lives on the ค่าคอมมิชชั่น tab instead (components/hunter/HunterCommissionTab.tsx)
// since it's saved alongside that tab's own "บันทึกช่องทางรับเงิน" button;
// both PATCH the same /api/hunter/settings endpoint, which merges whichever
// fields are present in the request (see that route).

type Settings = {
  name: string;
  email: string;
  phone: string | null;
  line_id: string | null;
  tax_id: string | null;
  tax_address: string | null;
};

export function HunterSettingsTab() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [lineId, setLineId] = useState("");
  const [taxId, setTaxId] = useState("");
  const [taxAddress, setTaxAddress] = useState("");
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
      setError(null);
    } catch (e: any) {
      setError(e?.message || "โหลดข้อมูลไม่สำเร็จ");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/hunter/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, lineId, taxId, taxAddress }),
      });
      const data = await res.json();
      if (!res.ok) {
        window.alert(data?.error || "บันทึกไม่สำเร็จ");
        return;
      }
      setSettings(data.settings);
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
