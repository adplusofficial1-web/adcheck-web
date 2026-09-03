"use client";

import { useCallback, useEffect, useState } from "react";

// Admin > Marketing > Hunter — "สิทธิ์เข้า /hunter" tab (formerly the
// "Hunter Freelancer (สิทธิ์เข้า /hunter)" section). Lets a platform admin
// whitelist/deactivate the external Hunter freelancers who get their own
// separate, read-only page at /hunter — see app/hunter/page.tsx and the
// project doc "Hunter Freelancer Page - Design.md". Mirrors
// components/admin/SalesOverview.tsx's add-user form/table shape
// (thClass/tdClass, bg-inverse header) but simpler: no polling/overview
// stats needed here, since a freelancer's /hunter page has no per-person
// quota or activity feed to monitor — just an add/enable/disable roster.
//
// CHANGE (2026-09-02, Hunter tab restructure, per user request): moved
// into its own tab (see components/admin/HunterMarketingTabs.tsx) instead
// of always-visible section; renamed its on-page heading to the shorter
// "สิทธิ์เข้า /hunter" to match the tab label.
//
// CHANGE (Bug Audit 4, 2569-09-02): the roster is no longer a pure admin
// whitelist — Hunters self-register on first Google sign-in at /hunter
// (lib/hunterUsers.ts:autoRegisterHunterUser) with assignment_approved =
// false, so this tab now also shows a "รอแอดมินอนุมัติรับ lead" badge on
// those rows plus an approve/suspend toggle (PATCH { assignmentApproved }).
// Rows added via the form below are approved from the start.

const thClass = "bg-inverse text-onInverse text-xs font-medium px-3 py-2 text-left";
const tdClass = "px-3 py-2 border-b border-border text-left align-top";

type HunterUser = {
  id: string;
  email: string;
  name: string;
  active: boolean;
  assignment_approved: boolean;
  created_at: string;
};

export function HunterUsersManager() {
  const [hunterUsers, setHunterUsers] = useState<HunterUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/hunter-users", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "โหลดข้อมูลไม่สำเร็จ");
      setHunterUsers(data.hunterUsers);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "โหลดข้อมูลไม่สำเร็จ");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const addHunterUser = async () => {
    const email = newEmail.trim();
    const name = newName.trim();
    if (!email || !name) return;
    setAdding(true);
    try {
      const res = await fetch("/api/admin/hunter-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name }),
      });
      const data = await res.json();
      if (!res.ok) {
        window.alert(data?.error || "เพิ่ม Hunter ไม่สำเร็จ");
        return;
      }
      setNewEmail("");
      setNewName("");
      await load();
    } finally {
      setAdding(false);
    }
  };

  // Both toggles hit the same PATCH endpoint with a different one-key body
  // — see app/api/admin/hunter-users/[id]/route.ts.
  const patchHunterUser = async (id: string, patch: { active: boolean } | { assignmentApproved: boolean }) => {
    setTogglingId(id);
    try {
      const res = await fetch(`/api/admin/hunter-users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) {
        window.alert(data?.error || "อัปเดตไม่สำเร็จ");
        return;
      }
      await load();
    } catch {
      window.alert("อัปเดตไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setTogglingId(null);
    }
  };

  const toggleActive = (id: string, active: boolean) => patchHunterUser(id, { active });
  const toggleApproved = (id: string, assignmentApproved: boolean) => patchHunterUser(id, { assignmentApproved });

  return (
    <div>
      <h2 className="text-lg font-medium text-primary">สิทธิ์เข้า /hunter</h2>
      <p className="mt-1 text-sm text-secondary max-w-2xl">
        รายชื่อ Freelancer ภายนอกที่ใช้หน้า{" "}
        <code className="text-xs bg-page border border-border rounded px-1 py-0.5">/hunter</code> — Hunter สมัครเองได้ทันที
        ด้วยการล็อกอิน Google ที่หน้านั้น (ได้ลิงก์ชวนสมัคร + Pipeline คลินิกที่หาเอง + ค่าคอมมิชชั่น) แต่จะเริ่ม
        &quot;ได้รับคลินิกจากแอดมิน&quot; (ปุ่มส่งในแท็บคิว Hunter) ก็ต่อเมื่อแอดมินกด &quot;อนุมัติรับ lead&quot; ในตารางนี้ก่อน —
        Hunter ที่เพิ่มจากฟอร์มด้านล่างถือว่าอนุมัติแล้ว การปิดใช้งานจะดึงคลินิกที่ยังไม่ปิดของคนนั้นกลับเข้าคิวรอส่งใหม่
      </p>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-xs text-secondary mb-1">อีเมล Google ของ Hunter</label>
          <input
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="hunter@example.com"
            className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-primary placeholder:text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        </div>
        <div>
          <label className="block text-xs text-secondary mb-1">ชื่อ</label>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="ชื่อ Hunter"
            className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-primary placeholder:text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        </div>
        <button
          type="button"
          onClick={addHunterUser}
          disabled={adding || !newEmail.trim() || !newName.trim()}
          className="rounded-md bg-inverse text-onInverse px-3 py-1.5 text-sm font-medium disabled:opacity-40"
        >
          {adding ? "กำลังเพิ่ม…" : "เพิ่ม Hunter"}
        </button>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
          <thead>
            <tr>
              <th className={thClass}>ชื่อ</th>
              <th className={thClass}>อีเมล</th>
              <th className={thClass}>สถานะ</th>
              <th className={thClass}></th>
            </tr>
          </thead>
          <tbody>
            {!hunterUsers ? (
              <tr>
                <td className={tdClass} colSpan={4}>
                  กำลังโหลด…
                </td>
              </tr>
            ) : hunterUsers.length === 0 ? (
              <tr>
                <td className={tdClass} colSpan={4}>
                  ยังไม่มี Hunter ในระบบ — เพิ่มด้วยฟอร์มด้านบน
                </td>
              </tr>
            ) : (
              hunterUsers.map((u) => (
                <tr key={u.id}>
                  <td className={tdClass}>{u.name}</td>
                  <td className={tdClass}>{u.email}</td>
                  <td className={tdClass}>
                    <div className="flex flex-wrap gap-1">
                      <span
                        className={`rounded-pill px-2 py-0.5 text-[11px] font-medium ${
                          u.active ? "bg-accentSoft text-accent" : "bg-page text-tertiary border border-border"
                        }`}
                      >
                        {u.active ? "ใช้งานอยู่" : "ปิดใช้งาน"}
                      </span>
                      {!u.assignment_approved && (
                        <span className="rounded-pill px-2 py-0.5 text-[11px] font-medium bg-warningSoft text-warning whitespace-nowrap">
                          รอแอดมินอนุมัติรับ lead
                        </span>
                      )}
                    </div>
                  </td>
                  <td className={tdClass}>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        disabled={togglingId === u.id}
                        onClick={() => toggleApproved(u.id, !u.assignment_approved)}
                        className={`rounded-md px-2.5 py-1 text-xs font-medium disabled:opacity-40 whitespace-nowrap ${
                          u.assignment_approved ? "border border-border" : "bg-inverse text-onInverse"
                        }`}
                      >
                        {u.assignment_approved ? "ระงับรับ lead" : "อนุมัติรับ lead"}
                      </button>
                      <button
                        type="button"
                        disabled={togglingId === u.id}
                        onClick={() => toggleActive(u.id, !u.active)}
                        className="rounded-md border border-border px-2.5 py-1 text-xs font-medium disabled:opacity-40 whitespace-nowrap"
                      >
                        {u.active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
