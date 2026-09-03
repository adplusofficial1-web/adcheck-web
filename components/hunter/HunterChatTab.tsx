"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// /hunter's "แชทกับทีมงาน" tab (2569-09-03, per user request "อยากให้ Hunter
// มีช่องสำหรับ แชทคุยสอบถาม กับ Admin Hunter โดยตรง") — one thread between
// this Hunter and the admin team, backed by app/api/hunter/messages/route.ts
// (migrations/021_hunter_messages.sql). Text only, no attachments — the
// user chose that scope.
//
// Polling, not push: same 10s self-re-arming timer pattern as every other
// live component in this app (see components/admin/HunterPipelineOverview.tsx
// for the mounted-ref reasoning). While this tab is on screen every poll
// passes ?markRead=1, so simply having the chat open is what clears the
// header badge (HunterShell polls the count separately) and tells the admin
// their reply was seen. The admin's side is components/admin/HunterChatInbox.tsx.

type Message = {
  id: string;
  sender: "hunter" | "admin";
  body: string;
  created_at: string;
  read_at: string | null;
};

const POLL_MS = 10_000;
const MAX_LENGTH = 2000;

// Day separators + per-message times, both pinned to Asia/Bangkok
// (audit-3 convention — see components/results/ResultsPageContent.tsx).
function dayKey(iso: string) {
  return new Date(iso).toLocaleDateString("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("th-TH", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function HunterChatTab() {
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const listRef = useRef<HTMLDivElement | null>(null);
  const lastCount = useRef(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/hunter/messages?markRead=1", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "โหลดข้อความไม่สำเร็จ");
      if (!mounted.current) return;
      setMessages(data.messages ?? []);
      setError(null);
    } catch (e: any) {
      if (mounted.current) setError(e?.message || "โหลดข้อความไม่สำเร็จ");
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    load();
    const tick = () => {
      pollTimer.current = setTimeout(async () => {
        await load();
        if (!mounted.current) return;
        tick();
      }, POLL_MS);
    };
    tick();
    return () => {
      mounted.current = false;
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [load]);

  // Stick to the bottom when new messages arrive (first load, our own
  // send, or an admin reply landing via poll) — but don't yank the view
  // if nothing changed.
  useEffect(() => {
    if (!messages) return;
    if (messages.length !== lastCount.current) {
      lastCount.current = messages.length;
      const el = listRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch("/api/hunter/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "ส่งข้อความไม่สำเร็จ");
      setDraft("");
      // Show it immediately rather than waiting up to 10s for the poll.
      setMessages((prev) => [...(prev ?? []), data.message]);
    } catch (e: any) {
      setSendError(e?.message || "ส่งข้อความไม่สำเร็จ");
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter newlines — the convention every chat app
    // Hunters already use (LINE desktop, Messenger) so nothing to learn.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  let lastDay = "";

  return (
    <div className="max-w-3xl">
      <h2 className="text-lg font-medium mb-1">แชทกับทีมงาน</h2>
      <p className="text-sm text-secondary mb-5">
        สอบถามเรื่องคลินิกที่ได้รับ การใช้งานระบบ หรือค่าคอมมิชชั่นได้ที่นี่ — ทีมงาน AdCheck จะตอบกลับในแชทนี้
        (ปกติภายในวันทำการ) ข้อความที่ยังไม่ได้อ่านจะขึ้นเป็นตัวเลขบนแท็บ
      </p>

      <div className="rounded-lg border border-border bg-surface overflow-hidden">
        <div ref={listRef} className="h-[420px] overflow-y-auto px-4 py-4 bg-page">
          {error && <p className="text-sm text-danger mb-3">{error}</p>}
          {messages === null && !error && <p className="text-sm text-secondary">กำลังโหลด…</p>}
          {messages && messages.length === 0 && (
            <div className="h-full flex items-center justify-center">
              <p className="text-sm text-secondary text-center">
                ยังไม่มีข้อความ — พิมพ์คำถามด้านล่างเพื่อเริ่มคุยกับทีมงาน
              </p>
            </div>
          )}
          {messages?.map((m) => {
            const day = dayKey(m.created_at);
            const showDay = day !== lastDay;
            lastDay = day;
            const mine = m.sender === "hunter";
            return (
              <div key={m.id}>
                {showDay && (
                  <div className="text-center text-[11px] text-secondary my-3">
                    <span className="rounded-pill bg-surface border border-border px-3 py-0.5">{day}</span>
                  </div>
                )}
                <div className={`flex mb-2 ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] rounded-lg px-3.5 py-2 text-sm whitespace-pre-wrap break-words ${
                      mine ? "bg-inverse text-onInverse" : "bg-surface border border-border"
                    }`}
                  >
                    {!mine && <div className="text-[11px] font-medium text-accent mb-0.5">ทีมงาน AdCheck</div>}
                    <div>{m.body}</div>
                    <div className={`text-[10px] mt-1 ${mine ? "text-onInverse/60" : "text-secondary"}`}>
                      {timeLabel(m.created_at)}
                      {mine && m.read_at ? " · อ่านแล้ว" : ""}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="border-t border-border p-3">
          {sendError && <p className="text-xs text-danger mb-2">{sendError}</p>}
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, MAX_LENGTH))}
              onKeyDown={onKeyDown}
              rows={2}
              maxLength={MAX_LENGTH}
              placeholder="พิมพ์ข้อความ… (Enter เพื่อส่ง, Shift+Enter ขึ้นบรรทัดใหม่)"
              className="flex-1 resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:border-borderStrong"
            />
            <button
              type="button"
              onClick={send}
              disabled={sending || !draft.trim()}
              className="rounded-md bg-inverse text-onInverse px-4 py-2 text-sm font-medium disabled:opacity-40 shrink-0"
            >
              {sending ? "กำลังส่ง…" : "ส่ง"}
            </button>
          </div>
          <div className="text-[11px] text-secondary mt-1.5 text-right">
            {draft.length}/{MAX_LENGTH}
          </div>
        </div>
      </div>
    </div>
  );
}
