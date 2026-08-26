"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Business = {
  id: string;
  name: string;
  type: string; // "clinic" | "agency"
  contact_email: string | null;
  phone: string | null;
  license_number: string | null;
  address: string | null;
  avatar_url: string | null;
  billing_name: string | null;
  tax_id: string | null;
  billing_address: string | null;
  credits_remaining: number;
  credits_reset_at: string | null;
  plan_name: string | null;
  price_thb: string | number | null;
  monthly_image_credits: number | null;
};

type Card = {
  id: string;
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
  is_default: boolean;
};

type Invoice = {
  id: string;
  invoice_number: string;
  created_at: string;
  amount_thb: string | number;
  channel: string | null;
  status: string;
  plan_name: string | null;
  plan_code: string | null;
};

// One still-active (unexpired) package purchase — see lib/credits.ts on
// the server. A business can hold several of these at once now; each
// keeps its own 30-day expiry and its own remaining-credits pool, and
// they're rendered as separate rows below instead of one single plan.
type ActivePackage = {
  id: string;
  plan_id: string;
  plan_name: string;
  plan_code: string;
  price_thb: string | number | null;
  credits_granted: number;
  credits_remaining: number;
  purchased_at: string;
  expires_at: string;
};

const TYPE_LABEL: Record<string, string> = {
  clinic: "คลินิกเดี่ยว",
  agency: "เครือข่าย / เอเจนซี่",
};

// Status values are the Thai strings the DB itself uses (see
// app/api/checkout/route.ts and the transactions_status_check
// constraint) — no separate English enum to keep in sync.
const STATUS_STYLE: Record<string, string> = {
  สำเร็จ: "bg-accentSoft text-accent",
  รอดำเนินการ: "bg-warningSoft text-warning",
  ล้มเหลว: "bg-dangerSoft text-danger",
};

// Whole days left until `resetAt`, ceil()'d so "later today" still reads
// as at least 1 day. 0 or negative means the 30-day cycle from the last
// purchase has already lapsed.
function daysRemaining(resetAt: string): number {
  return Math.ceil((new Date(resetAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Identifies the card network from the number's leading digits — standard,
// publicly-documented IIN ranges, nothing sensitive. Only this label plus
// the last 4 digits (below) ever leave the browser; see the POST handler
// in app/api/settings/cards/route.ts for why the full number never does.
function detectBrand(digits: string): string {
  if (/^4/.test(digits)) return "Visa";
  if (/^(5[1-5]|2[2-7])/.test(digits)) return "Mastercard";
  if (/^3[47]/.test(digits)) return "American Express";
  if (/^(6011|65)/.test(digits)) return "Discover";
  return "บัตร";
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse/40 px-4">
      <div className="w-full max-w-md rounded-lg bg-surface border border-border p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-medium">{title}</h2>
          <button onClick={onClose} className="text-secondary text-sm hover:text-primary" aria-label="ปิด">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <label className="block text-xs text-secondary mb-1.5">{label}</label>
      {children}
    </div>
  );
}

const inputClass =
  "w-full text-sm border border-border rounded-md px-3 py-2 bg-page focus:outline-none focus:border-borderStrong";

function EditButton({ onClick, label = "แก้ไข" }: { onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 flex items-center gap-1.5 rounded-md border border-border px-3.5 py-2 text-xs font-medium hover:bg-page"
    >
      <span aria-hidden>✎</span> {label}
    </button>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-tertiary text-xs mb-1">{label}</div>
      <div className="text-sm">{value || "—"}</div>
    </div>
  );
}

export function SettingsClient({
  business,
  cards,
  invoices,
  packages,
}: {
  business: Business;
  cards: Card[];
  invoices: Invoice[];
  packages: ActivePackage[];
}) {
  const router = useRouter();
  const [modal, setModal] = useState<null | "profile" | "clinic" | "billing" | "addCard">(null);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [deletingCardId, setDeletingCardId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // business.credits_remaining is already the combined total (legacy
  // balance + every active package's remaining credits — see
  // lib/db.ts:withActivePackageCredits on the server). Subtracting the
  // packages back out gives just the non-expiring legacy portion, so the
  // per-package rows below plus this one row always add back up to the
  // total shown above them.
  const packageCreditsSum = packages.reduce((sum, p) => sum + p.credits_remaining, 0);
  const legacyCredits = Math.max(business.credits_remaining - packageCreditsSum, 0);

  function closeAll() {
    setModal(null);
    setEditingCardId(null);
    setDeletingCardId(null);
    setError(null);
  }

  async function save(url: string, method: string, body: any) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "เกิดข้อผิดพลาด");
      closeAll();
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* ---------- Profile ---------- */}
      <section className="border border-border rounded-lg p-6 flex items-center gap-5">
        <div className="relative shrink-0">
          {business.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={business.avatar_url}
              alt={business.name}
              className="w-16 h-16 rounded-full object-cover"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-accentSoft text-accent flex items-center justify-center text-lg font-medium">
              {initials(business.name)}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-lg font-medium truncate">{business.name}</div>
          <div className="text-sm text-secondary truncate">
            {business.contact_email || "—"}
            {business.plan_name ? `  ·  ${business.plan_name}` : ""}
          </div>
        </div>
        <EditButton onClick={() => setModal("profile")} />
      </section>

      {/* ---------- Clinic info ---------- */}
      <section className="border border-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-medium">ข้อมูลคลินิก</div>
          <EditButton onClick={() => setModal("clinic")} />
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm mb-4">
          <InfoField label="ชื่อคลินิก" value={business.name} />
          <InfoField label="ประเภทธุรกิจ" value={TYPE_LABEL[business.type] || business.type} />
          <InfoField label="อีเมลติดต่อ" value={business.contact_email || ""} />
          <InfoField label="เบอร์โทรศัพท์" value={business.phone || ""} />
          <InfoField label="เลขที่ใบอนุญาตสถานพยาบาล" value={business.license_number || ""} />
        </div>
        <InfoField label="ที่อยู่คลินิก" value={business.address || ""} />
      </section>

      {/* ---------- Billing info ---------- */}
      <section className="border border-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-medium">ข้อมูลใบกำกับภาษี</div>
          <EditButton onClick={() => setModal("billing")} />
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm mb-4">
          <InfoField label="ชื่อผู้รับใบกำกับภาษี" value={business.billing_name || ""} />
          <InfoField label="เลขประจำตัวผู้เสียภาษี" value={business.tax_id || ""} />
        </div>
        <InfoField label="ที่อยู่ออกใบกำกับภาษี" value={business.billing_address || ""} />
      </section>

      {/* ---------- Plan & credits ---------- */}
      {/* CHANGE (multi-package credits): a business can hold several
          still-active package purchases at once now — buying a new one
          adds a row here alongside any that are still running, instead of
          replacing them. Each row keeps its own 30-day expiry and its own
          remaining-credits pool; the total at the top is the sum of all of
          them plus any non-expiring legacy/free credits. A package simply
          stops appearing (and stops counting toward the total) once its
          own expiry passes — see lib/credits.ts on the server. */}
      <section className="border border-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-medium">แพ็กเกจและเครดิต</div>
          <Link
            href="/pricing"
            className="shrink-0 rounded-md bg-inverse text-onInverse px-3.5 py-2 text-xs font-medium"
          >
            ซื้อแพ็กเกจเพิ่ม
          </Link>
        </div>

        <div className="flex items-center justify-between rounded-lg bg-accentSoft px-5 py-4 mb-5">
          <div className="text-sm text-accent">เครดิตคงเหลือรวมทุกแพ็กเกจ</div>
          <div className="text-2xl font-medium text-accent">{business.credits_remaining}</div>
        </div>

        {packages.length === 0 && legacyCredits <= 0 ? (
          <div className="text-sm text-secondary">ยังไม่มีแพ็กเกจ</div>
        ) : (
          <div className="space-y-3">
            {packages.map((pkg) => {
              const remaining = daysRemaining(pkg.expires_at);
              return (
                <div
                  key={pkg.id}
                  className="flex items-center gap-4 border border-border rounded-md p-4"
                >
                  <div className="flex-1 min-w-0">
                    <span className="inline-block rounded-pill bg-accentSoft text-accent text-xs font-medium px-3 py-1 mb-2">
                      {pkg.plan_name}
                    </span>
                    <div className="text-sm font-medium">
                      {pkg.price_thb ? `${Number(pkg.price_thb).toLocaleString()} บาท` : "—"}
                      {pkg.credits_granted ? `  ·  ${pkg.credits_granted} เครดิต/แพ็กเกจ` : ""}
                    </div>
                    <div className="text-xs text-secondary mt-1">
                      {remaining > 0
                        ? `เหลืออีก ${remaining} วัน — หมดอายุวันที่ ${new Date(
                            pkg.expires_at
                          ).toLocaleDateString("th-TH")}`
                        : "กำลังจะหมดอายุ"}
                    </div>
                  </div>
                  <div className="rounded-lg bg-page border border-border px-5 py-3 text-center shrink-0">
                    <div className="text-xl font-medium">{pkg.credits_remaining}</div>
                    <div className="text-xs text-secondary">/{pkg.credits_granted} เครดิต</div>
                  </div>
                </div>
              );
            })}
            {legacyCredits > 0 && (
              <div className="flex items-center gap-4 border border-dashed border-border rounded-md p-4">
                <div className="flex-1 min-w-0">
                  <span className="inline-block rounded-pill bg-page text-secondary text-xs font-medium px-3 py-1 mb-2">
                    เครดิตฟรี / ไม่มีวันหมดอายุ
                  </span>
                  <div className="text-xs text-secondary">เครดิตคงเหลือที่ไม่ได้ผูกกับแพ็กเกจใดๆ</div>
                </div>
                <div className="rounded-lg bg-page border border-border px-5 py-3 text-center shrink-0">
                  <div className="text-xl font-medium">{legacyCredits}</div>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ---------- Linked cards ---------- */}
      <section className="border border-border rounded-lg p-6">
        <div className="mb-4">
          <div className="text-sm font-medium">บัตรที่ผูกไว้</div>
          <p className="text-xs text-secondary mt-0.5">
            ใช้สำหรับตัดชำระอัตโนมัติเมื่อเติมเครดิตหรือต่ออายุแพ็กเกจ
          </p>
        </div>
        <div className="space-y-2 mb-3">
          {cards.map((c) => (
            <div key={c.id} className="rounded-md bg-page px-4 py-3">
              {deletingCardId === c.id ? (
                <div className="flex items-center justify-between text-sm">
                  <span>ลบบัตร {c.brand} •••• {c.last4} ใช่ไหม?</span>
                  <div className="flex gap-2">
                    <button
                      disabled={busy}
                      onClick={() => save(`/api/settings/cards/${c.id}`, "DELETE", {})}
                      className="rounded-md bg-danger text-onInverse px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                    >
                      ยืนยันลบ
                    </button>
                    <button
                      onClick={() => setDeletingCardId(null)}
                      className="rounded-md border border-border px-3 py-1.5 text-xs"
                    >
                      ยกเลิก
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-7 rounded border border-border bg-surface flex items-center justify-center text-[9px] font-semibold shrink-0">
                    {c.brand === "Visa" ? "VISA" : c.brand === "Mastercard" ? "MC" : c.brand.slice(0, 4).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <span>
                        {c.brand} •••• {c.last4}
                      </span>
                      {c.is_default && (
                        <span className="rounded-pill bg-accentSoft text-accent text-[11px] font-medium px-2 py-0.5">
                          ค่าเริ่มต้น
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-tertiary">
                      หมดอายุ {String(c.exp_month).padStart(2, "0")}/{String(c.exp_year).slice(-2)}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => setEditingCardId(c.id)}
                      className="w-8 h-8 rounded-md border border-border flex items-center justify-center hover:bg-surface"
                      aria-label="แก้ไขบัตร"
                    >
                      ✎
                    </button>
                    <button
                      onClick={() => setDeletingCardId(c.id)}
                      className="w-8 h-8 rounded-md border border-dangerSoft text-danger flex items-center justify-center hover:bg-dangerSoft"
                      aria-label="ลบบัตร"
                    >
                      🗑
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {cards.length === 0 && (
            <p className="text-sm text-secondary py-2">ยังไม่มีบัตรที่ผูกไว้</p>
          )}
        </div>
        <button
          onClick={() => setModal("addCard")}
          className="w-full rounded-md border border-dashed border-border py-3 text-sm font-medium hover:bg-page"
        >
          + เพิ่มบัตรใหม่
        </button>
      </section>

      {/* ---------- Payment history (read-only) ---------- */}
      <section className="border border-border rounded-lg p-6">
        <div className="mb-4">
          <div className="text-sm font-medium">ประวัติการชำระเงิน</div>
          <p className="text-xs text-secondary mt-0.5">ทุกรายการแพ็กเกจที่ซื้อ เรียงจากล่าสุด</p>
        </div>
        {invoices.length === 0 && <p className="text-sm text-secondary">ยังไม่มีรายการ</p>}
        <div className="space-y-2">
          {invoices.map((t) => (
            <div key={t.id} className="rounded-md bg-page px-4 py-3">
              <div className="flex items-start justify-between gap-3 mb-1.5">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">
                    {t.plan_name ? `แพ็ก${t.plan_name}` : "แพ็กเกจ"}
                  </div>
                  <div className="text-xs text-tertiary">
                    {t.invoice_number} ·{" "}
                    {new Date(t.created_at).toLocaleString("th-TH", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-medium">{Number(t.amount_thb).toLocaleString()} บาท</div>
                  <span
                    className={`inline-block mt-1 rounded-pill text-[11px] font-medium px-2 py-0.5 ${
                      STATUS_STYLE[t.status] || "bg-page text-secondary"
                    }`}
                  >
                    {t.status}
                  </span>
                </div>
              </div>
              {t.channel && <div className="text-xs text-tertiary">ช่องทาง: {t.channel}</div>}
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Modals ---------- */}
      {modal === "profile" && (
        <ProfileModal
          business={business}
          busy={busy}
          error={error}
          onClose={closeAll}
          onSave={(payload) => save("/api/settings/profile", "PATCH", payload)}
        />
      )}
      {modal === "clinic" && (
        <ClinicModal
          business={business}
          busy={busy}
          error={error}
          onClose={closeAll}
          onSave={(payload) => save("/api/settings/clinic-info", "PATCH", payload)}
        />
      )}
      {modal === "billing" && (
        <BillingModal
          business={business}
          busy={busy}
          error={error}
          onClose={closeAll}
          onSave={(payload) => save("/api/settings/billing-info", "PATCH", payload)}
        />
      )}
      {modal === "addCard" && (
        <AddCardModal
          busy={busy}
          error={error}
          onClose={closeAll}
          onSave={(payload) => save("/api/settings/cards", "POST", payload)}
        />
      )}
      {editingCardId && (
        <EditCardModal
          card={cards.find((c) => c.id === editingCardId)!}
          busy={busy}
          error={error}
          onClose={closeAll}
          onSave={(payload) => save(`/api/settings/cards/${editingCardId}`, "PATCH", payload)}
        />
      )}
    </div>
  );
}

function ProfileModal({
  business,
  busy,
  error,
  onClose,
  onSave,
}: {
  business: Business;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (payload: any) => void;
}) {
  const [name, setName] = useState(business.name);
  const [preview, setPreview] = useState<string | null>(business.avatar_url);
  const [loadingFile, setLoadingFile] = useState(false);

  async function onFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setLoadingFile(true);
    setPreview(await fileToBase64(file));
    setLoadingFile(false);
  }

  return (
    <Modal title="แก้ไขโปรไฟล์คลินิก" onClose={onClose}>
      <div className="flex items-center gap-4 mb-4">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="w-16 h-16 rounded-full object-cover" />
        ) : (
          <div className="w-16 h-16 rounded-full bg-accentSoft text-accent flex items-center justify-center text-lg font-medium">
            {initials(name || "?")}
          </div>
        )}
        <label className="text-xs font-medium border border-border rounded-md px-3 py-2 cursor-pointer hover:bg-page">
          {loadingFile ? "กำลังโหลด..." : "เปลี่ยนรูป"}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files)} />
        </label>
      </div>
      <Field label="ชื่อคลินิก">
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
      </Field>
      {error && <p className="text-sm text-danger mb-3">{error}</p>}
      <div className="flex justify-end gap-2 mt-2">
        <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm">
          ยกเลิก
        </button>
        <button
          disabled={busy || !name.trim()}
          onClick={() => onSave({ name, avatarBase64: preview !== business.avatar_url ? preview : undefined })}
          className="rounded-md bg-inverse text-onInverse px-4 py-2 text-sm disabled:opacity-50"
        >
          {busy ? "กำลังบันทึก..." : "บันทึก"}
        </button>
      </div>
    </Modal>
  );
}

function ClinicModal({
  business,
  busy,
  error,
  onClose,
  onSave,
}: {
  business: Business;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (payload: any) => void;
}) {
  const [name, setName] = useState(business.name);
  const [type, setType] = useState(business.type);
  const [phone, setPhone] = useState(business.phone || "");
  const [license, setLicense] = useState(business.license_number || "");
  const [address, setAddress] = useState(business.address || "");

  return (
    <Modal title="แก้ไขข้อมูลคลินิก" onClose={onClose}>
      <Field label="ชื่อคลินิก">
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
      </Field>
      <Field label="ประเภทธุรกิจ">
        <select value={type} onChange={(e) => setType(e.target.value)} className={inputClass}>
          <option value="clinic">คลินิกเดี่ยว</option>
          <option value="agency">เครือข่าย / เอเจนซี่</option>
        </select>
      </Field>
      <Field label="อีเมลติดต่อ">
        <input
          type="email"
          value={business.contact_email || ""}
          disabled
          className={`${inputClass} opacity-60 cursor-not-allowed`}
        />
        <p className="text-xs text-tertiary mt-1">
          อีเมลนี้ผูกกับบัญชี Google ที่ใช้เข้าสู่ระบบ แก้ไขไม่ได้
        </p>
      </Field>
      <Field label="เบอร์โทรศัพท์">
        <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
      </Field>
      <Field label="เลขที่ใบอนุญาตสถานพยาบาล">
        <input value={license} onChange={(e) => setLicense(e.target.value)} className={inputClass} />
      </Field>
      <Field label="ที่อยู่คลินิก">
        <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} className={inputClass} />
      </Field>
      {error && <p className="text-sm text-danger mb-3">{error}</p>}
      <div className="flex justify-end gap-2 mt-2">
        <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm">
          ยกเลิก
        </button>
        <button
          disabled={busy || !name.trim()}
          onClick={() =>
            onSave({
              name,
              type,
              phone,
              license_number: license,
              address,
            })
          }
          className="rounded-md bg-inverse text-onInverse px-4 py-2 text-sm disabled:opacity-50"
        >
          {busy ? "กำลังบันทึก..." : "บันทึก"}
        </button>
      </div>
    </Modal>
  );
}

function BillingModal({
  business,
  busy,
  error,
  onClose,
  onSave,
}: {
  business: Business;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (payload: any) => void;
}) {
  const [billingName, setBillingName] = useState(business.billing_name || "");
  const [taxId, setTaxId] = useState(business.tax_id || "");
  const [billingAddress, setBillingAddress] = useState(business.billing_address || "");

  return (
    <Modal title="แก้ไขข้อมูลใบกำกับภาษี" onClose={onClose}>
      <Field label="ชื่อผู้รับใบกำกับภาษี">
        <input value={billingName} onChange={(e) => setBillingName(e.target.value)} className={inputClass} />
      </Field>
      <Field label="เลขประจำตัวผู้เสียภาษี">
        <input value={taxId} onChange={(e) => setTaxId(e.target.value)} className={inputClass} />
      </Field>
      <Field label="ที่อยู่ออกใบกำกับภาษี">
        <textarea
          value={billingAddress}
          onChange={(e) => setBillingAddress(e.target.value)}
          rows={2}
          className={inputClass}
        />
      </Field>
      {error && <p className="text-sm text-danger mb-3">{error}</p>}
      <div className="flex justify-end gap-2 mt-2">
        <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm">
          ยกเลิก
        </button>
        <button
          disabled={busy}
          onClick={() =>
            onSave({ billing_name: billingName, tax_id: taxId, billing_address: billingAddress })
          }
          className="rounded-md bg-inverse text-onInverse px-4 py-2 text-sm disabled:opacity-50"
        >
          {busy ? "กำลังบันทึก..." : "บันทึก"}
        </button>
      </div>
    </Modal>
  );
}

function AddCardModal({
  busy,
  error,
  onClose,
  onSave,
}: {
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (payload: any) => void;
}) {
  const [number, setNumber] = useState("");
  const [expiry, setExpiry] = useState(""); // MM/YY
  const [localError, setLocalError] = useState<string | null>(null);

  const digits = number.replace(/\D/g, "");
  const brand = digits.length >= 4 ? detectBrand(digits) : null;

  function submit() {
    setLocalError(null);
    if (digits.length < 12) {
      setLocalError("กรุณากรอกหมายเลขบัตรให้ครบถ้วน");
      return;
    }
    const m = expiry.match(/^(\d{2})\s*\/\s*(\d{2})$/);
    if (!m) {
      setLocalError("กรุณากรอกวันหมดอายุในรูปแบบ MM/YY");
      return;
    }
    const expMonth = Number(m[1]);
    const expYear = 2000 + Number(m[2]);
    if (expMonth < 1 || expMonth > 12) {
      setLocalError("เดือนหมดอายุไม่ถูกต้อง");
      return;
    }
    // Only the derived brand + last 4 digits + expiry ever leave the
    // browser — the full number (`digits`) stays local and is discarded
    // once this fires. See app/api/settings/cards/route.ts.
    onSave({
      brand: detectBrand(digits),
      last4: digits.slice(-4),
      exp_month: expMonth,
      exp_year: expYear,
    });
  }

  return (
    <Modal title="เพิ่มบัตรใหม่" onClose={onClose}>
      <Field label="หมายเลขบัตร">
        <input
          inputMode="numeric"
          placeholder="1234 5678 9012 3456"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          className={inputClass}
        />
        {brand && <p className="text-xs text-secondary mt-1">ตรวจพบ: {brand}</p>}
      </Field>
      <Field label="วันหมดอายุ (MM/YY)">
        <input placeholder="12/27" value={expiry} onChange={(e) => setExpiry(e.target.value)} className={inputClass} />
      </Field>
      <p className="text-xs text-tertiary mb-3">
        ระบบจะเก็บเฉพาะประเภทบัตรและเลข 4 หลักสุดท้ายเท่านั้น — ไม่มีการบันทึกหมายเลขบัตรแบบเต็ม
      </p>
      {(localError || error) && <p className="text-sm text-danger mb-3">{localError || error}</p>}
      <div className="flex justify-end gap-2 mt-2">
        <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm">
          ยกเลิก
        </button>
        <button
          disabled={busy}
          onClick={submit}
          className="rounded-md bg-inverse text-onInverse px-4 py-2 text-sm disabled:opacity-50"
        >
          {busy ? "กำลังบันทึก..." : "เพิ่มบัตร"}
        </button>
      </div>
    </Modal>
  );
}

function EditCardModal({
  card,
  busy,
  error,
  onClose,
  onSave,
}: {
  card: Card;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (payload: any) => void;
}) {
  const [expiry, setExpiry] = useState(
    `${String(card.exp_month).padStart(2, "0")}/${String(card.exp_year).slice(-2)}`
  );
  const [isDefault, setIsDefault] = useState(card.is_default);
  const [localError, setLocalError] = useState<string | null>(null);

  function submit() {
    setLocalError(null);
    const m = expiry.match(/^(\d{2})\s*\/\s*(\d{2})$/);
    if (!m) {
      setLocalError("กรุณากรอกวันหมดอายุในรูปแบบ MM/YY");
      return;
    }
    onSave({
      exp_month: Number(m[1]),
      exp_year: 2000 + Number(m[2]),
      is_default: isDefault,
    });
  }

  return (
    <Modal title={`แก้ไขบัตร ${card.brand} •••• ${card.last4}`} onClose={onClose}>
      <Field label="วันหมดอายุ (MM/YY)">
        <input value={expiry} onChange={(e) => setExpiry(e.target.value)} className={inputClass} />
      </Field>
      <label className="flex items-center gap-2 text-sm mb-4">
        <input
          type="checkbox"
          checked={isDefault}
          onChange={(e) => setIsDefault(e.target.checked)}
          disabled={card.is_default}
        />
        ตั้งเป็นบัตรหลัก
      </label>
      {(localError || error) && <p className="text-sm text-danger mb-3">{localError || error}</p>}
      <div className="flex justify-end gap-2 mt-2">
        <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm">
          ยกเลิก
        </button>
        <button
          disabled={busy}
          onClick={submit}
          className="rounded-md bg-inverse text-onInverse px-4 py-2 text-sm disabled:opacity-50"
        >
          {busy ? "กำลังบันทึก..." : "บันทึก"}
        </button>
      </div>
    </Modal>
  );
}
