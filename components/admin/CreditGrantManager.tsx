"use client";

import { useState } from "react";
import type { CreditGrant } from "@/lib/creditGrants";
import { formatThaiDateTime } from "@/lib/formatDateTime";

type Props = { initialGrants: CreditGrant[] };

type FoundBusiness = {
  id: string;
  name: string;
  type: string;
  contact_email: string;
  credits_remaining: number;
};

const inputClass =
  "w-full rounded-md border border-border bg-surface px-4 py-2.5 text-sm text-primary placeholder:text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/30";

// Admin > เครดิต: a two-step form (find the clinic by email, confirm its
// current balance, then grant an amount) plus the grant history table —
// kept as one file for the same reason as KnowledgeBaseManager: this is a
// small, single-purpose feature with no reuse benefit from splitting it
// further.
export function CreditGrantManager({ initialGrants }: Props) {
  const [grants, setGrants] = useState<CreditGrant[]>(initialGrants);
  const [email, setEmail] = useState("");
  const [looking, setLooking] = useState(false);
  const [found, setFound] = useState<FoundBusiness | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [granting, setGranting] = useState(false);
  const [grantError, setGrantError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLooking(true);
    setLookupError(null);
    setFound(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/credits?lookupEmail=${encodeURIComponent(email.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "ค้นหาไม่สำเร็จ");
      setFound(data.business);
    } catch (e: any) {
      setLookupError(e.message || "เกิดข้อผิดพลาด");
    } finally {
      setLooking(false);
    }
  }

  async function grant(e: React.FormEvent) {
    e.preventDefault();
    if (!found) return;
    const amountNum = Number(amount);
    if (!Number.isInteger(amountNum) || amountNum <= 0) {
      setGrantError("จำนวนเครดิตต้องเป็นจำนวนเต็มมากกว่า 0");
      return;
    }
    setGranting(true);
    setGrantError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: found.contact_email, amount: amountNum, reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "ให้เครดิตไม่สำเร็จ");
      setGrants((prev) => [data.grant, ...prev]);
      setNotice(`ให้เครดิต ${amountNum} เครดิต แก่ ${found.name} เรียบร้อยแล้ว`);
      // Refresh the shown balance so the admin sees the effect immediately
      // without re-running the lookup by hand.
      setFound((prev) => (prev ? { ...prev, credits_remaining: prev.credits_remaining + amountNum } : prev));
      setAmount("");
      setReason("");
    } catch (e: any) {
      setGrantError(e.message || "เกิดข้อผิดพลาด");
    } finally {
      setGranting(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="rounded-lg border border-border bg-surface p-6">
        <form onSubmit={lookup} className="flex items-end gap-3">
          <div className="flex-1">
            <label className="block text-sm font-medium text-primary mb-2">อีเมลคลินิก (บัญชีที่ใช้ login)</label>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setFound(null);
              }}
              placeholder="clinic@example.com"
              className={inputClass}
              required
            />
          </div>
          <button
            type="submit"
            disabled={looking || !email.trim()}
            className="rounded-md bg-inverse px-5 py-2.5 text-sm font-medium text-onInverse disabled:opacity-50"
          >
            {looking ? "กำลังค้นหา..." : "ค้นหา"}
          </button>
        </form>
        {lookupError && <p className="mt-2 text-sm text-danger">{lookupError}</p>}

        {found && (
          <form onSubmit={grant} className="mt-6 border-t border-border pt-6 space-y-4">
            <div className="rounded-md bg-page px-4 py-3 text-sm">
              <p className="font-medium text-primary">
                {found.name} <span className="text-tertiary font-normal">({found.type === "clinic" ? "คลินิก" : "เอเจนซี่"})</span>
              </p>
              <p className="mt-1 text-secondary">{found.contact_email}</p>
              <p className="mt-1 text-secondary">
                ยอดเครดิตคงเหลือปัจจุบัน: <span className="font-medium text-primary">{found.credits_remaining}</span>
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-primary mb-2">จำนวนเครดิตที่จะให้</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="เช่น 5"
                  className={inputClass}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-primary mb-2">เหตุผล (ไม่บังคับ)</label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="เช่น โปรโมชั่นชักชวนคลินิกใหม่"
                  className={inputClass}
                />
              </div>
            </div>

            {grantError && <p className="text-sm text-danger">{grantError}</p>}
            {notice && <p className="text-sm text-accent">{notice}</p>}

            <button
              type="submit"
              disabled={granting || !amount}
              className="rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-onInverse disabled:opacity-50"
            >
              {granting ? "กำลังให้เครดิต..." : "ยืนยันให้เครดิต"}
            </button>
          </form>
        )}
      </div>

      <div>
        <h2 className="text-sm font-medium text-primary mb-3">ประวัติการให้เครดิต</h2>
        <ul className="space-y-2">
          {grants.length === 0 && (
            <li className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-tertiary">
              ยังไม่มีประวัติการให้เครดิต
            </li>
          )}
          {grants.map((g) => (
            <li key={g.id} className="rounded-md border border-border bg-surface px-4 py-3 text-sm">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <span className="font-medium text-primary">
                  {g.business_name} <span className="text-tertiary font-normal">({g.business_email})</span>
                </span>
                <span className="text-accent font-medium">+{g.amount} เครดิต</span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-4 flex-wrap text-xs text-tertiary">
                <span>{g.reason || "ไม่ได้ระบุเหตุผล"}</span>
                <span>
                  {formatThaiDateTime(g.created_at)} · โดย {g.granted_by}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
