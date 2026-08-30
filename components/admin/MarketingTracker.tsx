"use client";

import { useMemo, useState } from "react";
import type {
  MarketingAssociation,
  MarketingAssociationContact,
  MarketingAssociationStatus,
} from "@/lib/marketingAssociations";

type Props = { initialAssociations: MarketingAssociation[] };

const PHASES = [
  { id: 1, label: "เฟส 1 — ส่งข้อมูลฟรี" },
  { id: 2, label: "เฟส 2 — ลิงก์ทดลองใช้" },
  { id: 3, label: "เฟส 3 — พูดในงานสมาคม" },
  { id: 4, label: "เฟส 4 — MOU ส่วนลด" },
] as const;

const STATUS_META: Record<MarketingAssociationStatus, { label: string; className: string }> = {
  not_started: { label: "ยังไม่ได้ติดต่อ", className: "bg-page text-tertiary" },
  sent: { label: "ส่งแล้ว รอตอบกลับ", className: "bg-warningSoft text-warning" },
  responded: { label: "ตอบรับแล้ว", className: "bg-accentSoft text-accent" },
  meeting: { label: "นัดคุย/พูดแล้ว", className: "bg-accentSoft text-accent" },
  success: { label: "สำเร็จ", className: "bg-accentSoft text-accent" },
};

const inputClass =
  "w-full rounded-md border border-border bg-surface px-4 py-2.5 text-sm text-primary placeholder:text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/30";
const smallInputClass =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-xs text-primary placeholder:text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/30";

// FIX (bug audit round 2 follow-up, found during post-deploy verification):
// this used to be `new Date().toISOString().slice(0, 10)` — deterministic
// in the sense that toISOString() is always UTC, but it's still computed
// during render, and this component ("use client") is server-rendered once
// for the initial HTML and then hydrated in the browser milliseconds
// later. Right around the UTC day boundary those two renders can land on
// different calendar days, which flips `isOverdue()`'s result and, with
// it, a card's border color/class and its "(เกินกำหนด)" text — a real
// server/client mismatch (same class of bug as lib/formatDateTime.ts's
// missing timeZone, confirmed live via React hydration errors #418/#423/
// #425 on /admin/marketing). Separately, UTC isn't even the right "today"
// for this field — next_followup dates are entered by a Thailand-based
// admin — so this now fixes both problems at once: shift by Thailand's
// fixed UTC+7 (no DST) before slicing, so "today" always means Thailand's
// today, the same on every machine regardless of its local timezone.
function todayStr(): string {
  const bangkokMs = Date.now() + 7 * 60 * 60 * 1000;
  return new Date(bangkokMs).toISOString().slice(0, 10);
}

function isOverdue(a: MarketingAssociation): boolean {
  if (!a.next_followup) return false;
  return a.next_followup <= todayStr() && a.status !== "success";
}

type FormState = {
  id: string | null;
  name: string;
  contact: string;
  phase: number;
  status: MarketingAssociationStatus;
  nextFollowup: string;
  notes: string;
};

const emptyForm: FormState = { id: null, name: "", contact: "", phase: 1, status: "not_started", nextFollowup: "", notes: "" };

type ContactFormState = { firstName: string; lastName: string; email: string; role: string; phone: string };
const emptyContactForm: ContactFormState = { firstName: "", lastName: "", email: "", role: "", phone: "" };

// Admin > Marketing: a 4-column pipeline board (one per outreach phase —
// see docs/adcheck-organic-marketing-strategy.md for why associations are
// worked through free-content -> trial link -> speaking slot -> MOU in
// that order rather than pitching a partnership cold) plus a slide-over
// edit panel, same "one file, small single-purpose feature" call as
// CreditGrantManager.
//
// Each association can hold several contacts (นายกสมาคม, เลขาธิการ,
// ประชาสัมพันธ์, ...) — see migrations/008_marketing_association_contacts.sql.
// The contacts list lives inside the edit panel and is its own fetch/save
// cycle (contacts belong to an already-created association, so the list
// only loads once form.id is set — a brand-new association must be saved
// once before anyone can be added to it).
export function MarketingTracker({ initialAssociations }: Props) {
  const [associations, setAssociations] = useState<MarketingAssociation[]>(initialAssociations);
  const [panelOpen, setPanelOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [contacts, setContacts] = useState<MarketingAssociationContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactForm, setContactForm] = useState<ContactFormState>(emptyContactForm);
  const [addingContact, setAddingContact] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);

  const byPhase = useMemo(() => {
    const grouped: Record<number, MarketingAssociation[]> = { 1: [], 2: [], 3: [], 4: [] };
    for (const a of associations) grouped[a.phase]?.push(a);
    return grouped;
  }, [associations]);

  const stats = useMemo(() => {
    const total = associations.length;
    const overdue = associations.filter(isOverdue).length;
    const responded = associations.filter((a) => a.status !== "not_started").length;
    const success = associations.filter((a) => a.status === "success").length;
    return {
      total,
      overdue,
      responseRate: total ? Math.round((responded / total) * 100) : 0,
      success,
    };
  }, [associations]);

  function openCreate() {
    setForm(emptyForm);
    setError(null);
    setContacts([]);
    setContactForm(emptyContactForm);
    setContactError(null);
    setPanelOpen(true);
  }

  async function openEdit(a: MarketingAssociation) {
    setForm({
      id: a.id,
      name: a.name,
      contact: a.contact ?? "",
      phase: a.phase,
      status: a.status,
      nextFollowup: a.next_followup ?? "",
      notes: a.notes ?? "",
    });
    setError(null);
    setContactForm(emptyContactForm);
    setContactError(null);
    setPanelOpen(true);

    setContactsLoading(true);
    try {
      const res = await fetch(`/api/admin/marketing/${a.id}/contacts`);
      const data = await res.json();
      if (res.ok) setContacts(data.contacts);
    } finally {
      setContactsLoading(false);
    }
  }

  function closePanel() {
    setPanelOpen(false);
    setError(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("กรอกชื่อสมาคมก่อนครับ");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        contact: form.contact.trim() || null,
        phase: form.phase,
        status: form.status,
        nextFollowup: form.nextFollowup || null,
        notes: form.notes.trim() || null,
      };
      const res = await fetch(form.id ? `/api/admin/marketing/${form.id}` : "/api/admin/marketing", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "บันทึกไม่สำเร็จ");

      if (form.id) {
        setAssociations((prev) => prev.map((a) => (a.id === form.id ? { ...a, ...data.association } : a)));
      } else {
        setAssociations((prev) => [{ ...data.association, contact_count: 0 }, ...prev]);
        // Keep the panel open and switch straight into edit mode for the
        // association just created, since adding contacts requires an id
        // — closing here would force the admin to re-open it themselves.
        setForm((f) => ({ ...f, id: data.association.id }));
        setSaving(false);
        return;
      }
      closePanel();
    } catch (e: any) {
      setError(e.message || "เกิดข้อผิดพลาด");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!form.id) return;
    if (!confirm("ลบสมาคมนี้ออกจาก pipeline? (ผู้ติดต่อทั้งหมดของสมาคมนี้จะถูกลบไปด้วย)")) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/marketing/${form.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "ลบไม่สำเร็จ");
      setAssociations((prev) => prev.filter((a) => a.id !== form.id));
      closePanel();
    } catch (e: any) {
      setError(e.message || "เกิดข้อผิดพลาด");
    } finally {
      setDeleting(false);
    }
  }

  async function addContact(e: React.FormEvent) {
    e.preventDefault();
    if (!form.id) return;
    if (!contactForm.firstName.trim()) {
      setContactError("กรอกชื่อผู้ติดต่อก่อนครับ");
      return;
    }
    setAddingContact(true);
    setContactError(null);
    try {
      const res = await fetch(`/api/admin/marketing/${form.id}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: contactForm.firstName.trim(),
          lastName: contactForm.lastName.trim() || null,
          email: contactForm.email.trim() || null,
          role: contactForm.role.trim() || null,
          phone: contactForm.phone.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "เพิ่มผู้ติดต่อไม่สำเร็จ");
      setContacts((prev) => [...prev, data.contact]);
      setContactForm(emptyContactForm);
      setAssociations((prev) =>
        prev.map((a) => (a.id === form.id ? { ...a, contact_count: a.contact_count + 1 } : a))
      );
    } catch (e: any) {
      setContactError(e.message || "เกิดข้อผิดพลาด");
    } finally {
      setAddingContact(false);
    }
  }

  async function removeContact(contactId: string) {
    if (!form.id) return;
    if (!confirm("ลบผู้ติดต่อคนนี้?")) return;
    try {
      const res = await fetch(`/api/admin/marketing/${form.id}/contacts/${contactId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "ลบไม่สำเร็จ");
      setContacts((prev) => prev.filter((c) => c.id !== contactId));
      setAssociations((prev) =>
        prev.map((a) => (a.id === form.id ? { ...a, contact_count: Math.max(0, a.contact_count - 1) } : a))
      );
    } catch (e: any) {
      setContactError(e.message || "เกิดข้อผิดพลาด");
    }
  }

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-lg border border-border bg-surface p-5">
          <p className="text-xs text-secondary">สมาคมทั้งหมดใน pipeline</p>
          <p className="mt-1 text-2xl font-medium text-primary">{stats.total}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-5">
          <p className="text-xs text-secondary">ต้องติดตามวันนี้ / เกินกำหนด</p>
          <p className="mt-1 text-2xl font-medium text-danger">{stats.overdue}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-5">
          <p className="text-xs text-secondary">อัตราตอบกลับ</p>
          <p className="mt-1 text-2xl font-medium text-primary">{stats.responseRate}%</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-5">
          <p className="text-xs text-secondary">ปิด MOU สำเร็จ</p>
          <p className="mt-1 text-2xl font-medium text-accent">{stats.success}</p>
        </div>
      </div>

      <div className="mt-8 flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-sm font-medium text-primary">Pipeline สมาคม</h2>
        <div className="flex gap-3">
          <a
            href="/api/admin/marketing/contacts?format=csv"
            className="rounded-md border border-border px-5 py-2.5 text-sm font-medium text-primary"
          >
            ดาวน์โหลดรายชื่ออีเมลทั้งหมด (CSV)
          </a>
          <button
            type="button"
            onClick={openCreate}
            className="rounded-md bg-inverse px-5 py-2.5 text-sm font-medium text-onInverse"
          >
            + เพิ่มสมาคม
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {PHASES.map((phase) => {
          const items = byPhase[phase.id] ?? [];
          return (
            <div key={phase.id}>
              <div className="flex items-center justify-between border-b-2 border-border pb-2 mb-3">
                <h3 className="text-sm font-medium text-primary">{phase.label}</h3>
                <span className="rounded-pill bg-page px-2.5 py-0.5 text-xs text-secondary">{items.length}</span>
              </div>
              <div className="space-y-2.5">
                {items.length === 0 && (
                  <div className="rounded-md border border-dashed border-border px-4 py-6 text-center text-xs text-tertiary">
                    ยังไม่มีสมาคมในเฟสนี้
                  </div>
                )}
                {items.map((a) => {
                  const overdue = isOverdue(a);
                  const meta = STATUS_META[a.status];
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => openEdit(a)}
                      className={`w-full text-left rounded-lg border bg-surface p-3.5 transition-colors hover:border-borderStrong ${
                        overdue ? "border-danger" : "border-border"
                      }`}
                    >
                      <p className="text-sm font-medium text-primary">{a.name}</p>
                      <p className="mt-0.5 text-xs text-tertiary">
                        {a.contact_count > 0 ? `${a.contact_count} ผู้ติดต่อ` : "ยังไม่มีผู้ติดต่อ"}
                      </p>
                      <span className={`mt-2 inline-block rounded-pill px-2.5 py-0.5 text-xs font-medium ${meta.className}`}>
                        {meta.label}
                      </span>
                      {a.next_followup && (
                        <p className={`mt-2 text-xs ${overdue ? "font-medium text-danger" : "text-tertiary"}`}>
                          นัดติดตาม: {a.next_followup}
                          {overdue ? " (เกินกำหนด)" : ""}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {panelOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse/40 px-4 py-8">
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg bg-surface p-6">
            <h3 className="text-lg font-medium text-primary">{form.id ? "แก้ไขข้อมูลสมาคม" : "เพิ่มสมาคมใหม่"}</h3>
            <form onSubmit={save} className="mt-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-primary mb-2">ชื่อสมาคม</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="เช่น ATAP"
                  className={inputClass}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-primary mb-2">สรุปผู้ติดต่อ (แสดงสั้นๆ)</label>
                <input
                  value={form.contact}
                  onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))}
                  placeholder="เช่น ฝ่ายประชาสัมพันธ์ — ดูรายชื่อเต็มด้านล่าง"
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-primary mb-2">เฟสปัจจุบัน</label>
                  <select
                    value={form.phase}
                    onChange={(e) => setForm((f) => ({ ...f, phase: Number(e.target.value) }))}
                    className={inputClass}
                  >
                    {PHASES.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-primary mb-2">สถานะ</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as MarketingAssociationStatus }))}
                    className={inputClass}
                  >
                    {Object.entries(STATUS_META).map(([value, meta]) => (
                      <option key={value} value={value}>
                        {meta.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-primary mb-2">วันนัดติดตามถัดไป</label>
                <input
                  type="date"
                  value={form.nextFollowup}
                  onChange={(e) => setForm((f) => ({ ...f, nextFollowup: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-primary mb-2">บันทึก</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="รายละเอียด/เนื้อหาที่คุยไป"
                  className={`${inputClass} min-h-[80px]`}
                />
              </div>

              {error && <p className="text-sm text-danger">{error}</p>}

              <div className="flex items-center justify-between pt-2">
                {form.id ? (
                  <button
                    type="button"
                    onClick={remove}
                    disabled={deleting}
                    className="rounded-md border border-danger px-4 py-2.5 text-sm text-danger disabled:opacity-50"
                  >
                    {deleting ? "กำลังลบ..." : "ลบสมาคม"}
                  </button>
                ) : (
                  <span />
                )}
                <div className="flex gap-3">
                  <button type="button" onClick={closePanel} className="rounded-md border border-border px-4 py-2.5 text-sm text-primary">
                    ปิด
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-md bg-inverse px-5 py-2.5 text-sm font-medium text-onInverse disabled:opacity-50"
                  >
                    {saving ? "กำลังบันทึก..." : "บันทึก"}
                  </button>
                </div>
              </div>
            </form>

            {/* Contacts list — only once the association has an id, since
                a contact must belong to a saved association row. */}
            {form.id && (
              <div className="mt-6 border-t border-border pt-6">
                <h4 className="text-sm font-medium text-primary mb-3">
                  รายชื่อผู้ติดต่อ {contacts.length > 0 && `(${contacts.length})`}
                </h4>

                {contactsLoading ? (
                  <p className="text-xs text-tertiary">กำลังโหลด...</p>
                ) : (
                  <ul className="space-y-2 mb-4">
                    {contacts.length === 0 && (
                      <li className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-tertiary">
                        ยังไม่มีผู้ติดต่อ เพิ่มด้านล่างได้เลย
                      </li>
                    )}
                    {contacts.map((c) => (
                      <li key={c.id} className="rounded-md border border-border bg-page px-3 py-2.5 text-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-primary">
                              {c.first_name} {c.last_name || ""}
                              {c.role && <span className="ml-2 text-xs font-normal text-tertiary">({c.role})</span>}
                            </p>
                            <p className="text-xs text-secondary">
                              {c.email || "ไม่มีอีเมล"}
                              {c.phone ? ` · ${c.phone}` : ""}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeContact(c.id)}
                            className="text-xs text-danger shrink-0"
                          >
                            ลบ
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                <form onSubmit={addContact} className="rounded-md border border-border bg-page p-3 space-y-2.5">
                  <div className="grid grid-cols-2 gap-2.5">
                    <input
                      value={contactForm.firstName}
                      onChange={(e) => setContactForm((f) => ({ ...f, firstName: e.target.value }))}
                      placeholder="ชื่อ *"
                      className={smallInputClass}
                    />
                    <input
                      value={contactForm.lastName}
                      onChange={(e) => setContactForm((f) => ({ ...f, lastName: e.target.value }))}
                      placeholder="นามสกุล"
                      className={smallInputClass}
                    />
                  </div>
                  <input
                    type="email"
                    value={contactForm.email}
                    onChange={(e) => setContactForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="อีเมล"
                    className={smallInputClass}
                  />
                  <div className="grid grid-cols-2 gap-2.5">
                    <input
                      value={contactForm.role}
                      onChange={(e) => setContactForm((f) => ({ ...f, role: e.target.value }))}
                      placeholder="ตำแหน่ง เช่น เลขาธิการ"
                      className={smallInputClass}
                    />
                    <input
                      value={contactForm.phone}
                      onChange={(e) => setContactForm((f) => ({ ...f, phone: e.target.value }))}
                      placeholder="เบอร์โทร"
                      className={smallInputClass}
                    />
                  </div>
                  {contactError && <p className="text-xs text-danger">{contactError}</p>}
                  <button
                    type="submit"
                    disabled={addingContact}
                    className="rounded-md bg-inverse px-4 py-2 text-xs font-medium text-onInverse disabled:opacity-50"
                  >
                    {addingContact ? "กำลังเพิ่ม..." : "+ เพิ่มผู้ติดต่อ"}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
