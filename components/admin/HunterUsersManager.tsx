"use client";

import { useCallback, useEffect, useState } from "react";

// Admin > Marketing > Hunter — "Hunter Freelancer (สิทธิ์เข้า /hunter)"
// section. Lets a platform admin whitelist/deactivate the external Hunter
// freelancers who get their own separate, read-only page at /hunter — see
// app/hunter/page.tsx and the project doc "Hunter Freelancer Page -
// Design.md". Mirrors components/admin/SalesOverview.tsx's add-user
// form/table shape (thClass/tdClass, bg-inverse header) but simpler: no
// polling/overview stats needed here, since a freelancer's /hunter page
// has no per-person quota or activity feed to monitor — just an
// add/enable/disable roster.

const thClass = "bg-inverse text-onInverse text-xs font-medium px-3 py-2 text-left";
const tdClass = "px-3 py-2 border-b border-border text-left align-top";

type HunterUser = {
  id: string;
  email: string;
  name: string;
  active: boolean;
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

  const toggleActive = async (id: string, active: boolean) => {
    setTogglingId(id);
    try {
      const res = await fetch(`/api/admin/hunter-users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      const data = await res.json();
      if (!res.ok) {
        window.alert(data?.error || "อัปเดตไม่สำเร็จ");
        return;
      }
      await load();
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="mt-10">
      <h2 className="text-lg font-medium text-primary">Hunter Freelancer (สิทธิ์เข้า /hunter)</h2>
      <p className="mt-1 text-sm text-secondary max-w-2xl">
        รายชื่อ Freelancer ภายนอกที่ล็อกอิน Google เข้าหน้า{" "}
        <code className="text-xs bg-page border border-border rounded px-1 py-0.5">/hunter</code> ได้ — หน้านั้นแยก
        จากหน้านี้โดยสมบูรณ์ (ดูอย่างเดียว: ชื่อคลินิก + คัดลอกลิงก์ผลตรวจสอบ) ไม่มีสิทธิ์แก้ไข/นำเข้า/ลบข้อมูลใดๆ
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
                    <span
                      className={`rounded-pill px-2 py-0.5 text-[11px] font-medium ${
                        u.active ? "bg-accentSoft text-accent" : "bg-page text-tertiary border border-border"
                      }`}
                    >
                      {u.active ? "ใช้งานอยู่" : "ปิดใช้งาน"}
                    </span>
                  </td>
                  <td className={tdClass}>
                    <button
                      type="button"
                      disabled={togglingId === u.id}
                      onClick={() => toggleActive(u.id, !u.active)}
                      className="rounded-md border border-border px-2.5 py-1 text-xs font-medium disabled:opacity-40 whitespace-nowrap"
                    >
                      {u.active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                    </button>
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
