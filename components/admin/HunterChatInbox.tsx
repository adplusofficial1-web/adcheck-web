"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Admin > Marketing > Hunter > "แชท" tab (2569-09-03, per user request
// "อยากให้ Hunter มีช่องสำหรับ แชทคุยสอบถาม กับ Admin Hunter โดยตรง") — the
// admin side of the Hunter ↔ admin chat. Left: every Hunter as a room,
// unread-first (app/api/admin/hunter-messages/route.ts). Right: the open
// thread (app/api/admin/hunter-messages/[hunterUserId]/route.ts). The
// Hunter side is components/hunter/HunterChatTab.tsx.
//
// Two polls while mounted: the room list every 12s (so a new question
// from any Hunter surfaces without a refresh) and the open thread every
// 8s with ?markRead=1 (so reading is what clears that room's badge). Both
// use the self-re-arming timer pattern from HunterPipelineOverview.tsx.
// Any admin in ADMIN_EMAILS can reply; each admin message records their
// email so a second admin can see who already answered.

type Room = {
  hunter_user_id: string;
  name: string;
  email: string;
  active: boolean;
  avatar_url: string | null;
  unread_count: number;
  last_message_at: string | null;
  last_message_body: string | null;
  last_message_sender: "hunter" | "admin" | null;
};

type Message = {
  id: string;
  sender: "hunter" | "admin";
  sender_email: string | null;
  body: string;
  created_at: string;
  read_at: string | null;
};

type ThreadHunter = { id: string; name: string; email: string; active: boolean; avatar_url: string | null };

const ROOMS_POLL_MS = 12_000;
const THREAD_POLL_MS = 8_000;
const MAX_LENGTH = 2000;

function dayKey(iso: string) {
  return new Date(iso).toLocaleDateString("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" });
}
function relativeDay(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date().toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok" });
  const that = d.toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok" });
  return that === today ? timeLabel(iso) : d.toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short" });
}

// Tailwind's JIT only emits classes it can see literally, so the two sizes
// are spelled out instead of interpolated.
function Avatar({ name, avatarUrl, size = "md" }: { name: string; avatarUrl: string | null; size?: "md" | "sm" }) {
  const cls = `${size === "sm" ? "w-8 h-8" : "w-9 h-9"} rounded-full shrink-0`;
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatarUrl} alt="" className={`${cls} object-cover`} />;
  }
  return (
    <div className={`${cls} bg-accentSoft text-accent flex items-center justify-center text-xs font-medium`}>
      {name?.trim()?.[0]?.toUpperCase() || "?"}
    </div>
  );
}

export function HunterChatInbox() {
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [roomsError, setRoomsError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [hunter, setHunter] = useState<ThreadHunter | null>(null);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const mounted = useRef(true);
  const roomsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const threadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const lastCount = useRef(0);
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selected;

  const loadRooms = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/hunter-messages", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "โหลดรายการแชทไม่สำเร็จ");
      if (!mounted.current) return;
      setRooms(data.rooms ?? []);
      setRoomsError(null);
    } catch (e: any) {
      if (mounted.current) setRoomsError(e?.message || "โหลดรายการแชทไม่สำเร็จ");
    }
  }, []);

  const loadThread = useCallback(async (hunterUserId: string) => {
    try {
      const res = await fetch(`/api/admin/hunter-messages/${hunterUserId}?markRead=1`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "โหลดข้อความไม่สำเร็จ");
      // The admin may have clicked another room while this was in flight.
      if (!mounted.current || selectedRef.current !== hunterUserId) return;
      setHunter(data.hunter);
      setMessages(data.messages ?? []);
      setThreadError(null);
      // Reading clears this room's badge server-side; mirror it locally so
      // the list doesn't wait for its own next poll.
      setRooms((prev) =>
        prev ? prev.map((r) => (r.hunter_user_id === hunterUserId ? { ...r, unread_count: 0 } : r)) : prev
      );
    } catch (e: any) {
      if (mounted.current && selectedRef.current === hunterUserId) {
        setThreadError(e?.message || "โหลดข้อความไม่สำเร็จ");
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    loadRooms();
    const tick = () => {
      roomsTimer.current = setTimeout(async () => {
        await loadRooms();
        if (!mounted.current) return;
        tick();
      }, ROOMS_POLL_MS);
    };
    tick();
    return () => {
      mounted.current = false;
      if (roomsTimer.current) clearTimeout(roomsTimer.current);
    };
  }, [loadRooms]);

  useEffect(() => {
    if (threadTimer.current) clearTimeout(threadTimer.current);
    if (!selected) {
      setHunter(null);
      setMessages(null);
      return;
    }
    setMessages(null);
    setThreadError(null);
    lastCount.current = 0;
    loadThread(selected);
    const tick = () => {
      threadTimer.current = setTimeout(async () => {
        if (selectedRef.current !== selected) return;
        await loadThread(selected);
        if (!mounted.current || selectedRef.current !== selected) return;
        tick();
      }, THREAD_POLL_MS);
    };
    tick();
    return () => {
      if (threadTimer.current) clearTimeout(threadTimer.current);
    };
  }, [selected, loadThread]);

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
    if (!body || sending || !selected) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch(`/api/admin/hunter-messages/${selected}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "ส่งข้อความไม่สำเร็จ");
      setDraft("");
      setMessages((prev) => [...(prev ?? []), data.message]);
      setRooms((prev) =>
        prev
          ? prev.map((r) =>
              r.hunter_user_id === selected
                ? { ...r, last_message_at: data.message.created_at, last_message_body: body, last_message_sender: "admin" }
                : r
            )
          : prev
      );
    } catch (e: any) {
      setSendError(e?.message || "ส่งข้อความไม่สำเร็จ");
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const totalUnread = rooms?.reduce((a, r) => a + r.unread_count, 0) ?? 0;
  const q = filter.trim().toLowerCase();
  const visibleRooms = rooms?.filter((r) => !q || r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q)) ?? [];

  let lastDay = "";

  return (
    <div>
      <h2 className="text-lg font-medium mb-1">แชทกับ Hunter</h2>
      <p className="text-sm text-secondary mb-5 max-w-3xl">
        ข้อความจาก Hunter ทุกคนรวมอยู่ที่นี่ — ห้องที่มีข้อความรอตอบจะขึ้นก่อน เปิดห้องแล้วถือว่าอ่านแล้ว (Hunter จะเห็น
        &quot;อ่านแล้ว&quot; ใต้ข้อความของเขา) ตอบได้ทุกคนที่เป็นแอดมิน — ระบบบันทึกว่าใครตอบ
        {totalUnread > 0 && <span className="ml-2 text-danger font-medium">รอตอบ {totalUnread} ข้อความ</span>}
      </p>

      <div className="rounded-lg border border-border bg-surface overflow-hidden grid grid-cols-1 md:grid-cols-[300px_1fr]" style={{ minHeight: 520 }}>
        {/* Room list */}
        <div className="border-b md:border-b-0 md:border-r border-border flex flex-col max-h-[520px]">
          <div className="p-3 border-b border-border">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="ค้นหาชื่อ / อีเมล Hunter"
              className="w-full rounded-md border border-border bg-page px-3 py-1.5 text-sm focus:outline-none focus:border-borderStrong"
            />
          </div>
          <div className="overflow-y-auto flex-1">
            {roomsError && <p className="text-sm text-danger p-3">{roomsError}</p>}
            {rooms === null && !roomsError && <p className="text-sm text-secondary p-3">กำลังโหลด…</p>}
            {rooms && visibleRooms.length === 0 && <p className="text-sm text-secondary p-3">ไม่พบ Hunter</p>}
            {visibleRooms.map((r) => {
              const active = r.hunter_user_id === selected;
              return (
                <button
                  key={r.hunter_user_id}
                  type="button"
                  onClick={() => setSelected(r.hunter_user_id)}
                  className={`w-full text-left px-3 py-2.5 flex items-center gap-3 border-b border-border transition-colors ${
                    active ? "bg-accentSoft" : "hover:bg-page"
                  }`}
                >
                  <Avatar name={r.name} avatarUrl={r.avatar_url} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-sm truncate ${r.unread_count > 0 ? "font-medium" : ""}`}>
                        {r.name || r.email}
                        {!r.active && <span className="ml-1.5 text-[10px] text-secondary">(ปิดใช้งาน)</span>}
                      </span>
                      <span className="text-[10px] text-secondary shrink-0">{relativeDay(r.last_message_at)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-secondary truncate">
                        {r.last_message_body
                          ? `${r.last_message_sender === "admin" ? "คุณ: " : ""}${r.last_message_body}`
                          : "ยังไม่มีข้อความ"}
                      </span>
                      {r.unread_count > 0 && (
                        <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-pill bg-danger text-onInverse text-[10px] font-medium px-1 shrink-0">
                          {r.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Thread */}
        <div className="flex flex-col max-h-[520px]">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center p-6">
              <p className="text-sm text-secondary text-center">เลือก Hunter ทางซ้ายเพื่อดูหรือเริ่มบทสนทนา</p>
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-border flex items-center gap-3">
                {hunter && <Avatar name={hunter.name} avatarUrl={hunter.avatar_url} size="sm" />}
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{hunter?.name ?? "…"}</div>
                  <div className="text-xs text-secondary truncate">
                    {hunter?.email}
                    {hunter && !hunter.active && " · ปิดใช้งานแล้ว — Hunter ตอบกลับไม่ได้จนกว่าจะเปิดใช้งาน"}
                  </div>
                </div>
              </div>

              <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4 bg-page">
                {threadError && <p className="text-sm text-danger mb-3">{threadError}</p>}
                {messages === null && !threadError && <p className="text-sm text-secondary">กำลังโหลด…</p>}
                {messages && messages.length === 0 && (
                  <p className="text-sm text-secondary text-center mt-10">ยังไม่มีข้อความในห้องนี้ — พิมพ์ด้านล่างเพื่อเริ่ม</p>
                )}
                {messages?.map((m) => {
                  const day = dayKey(m.created_at);
                  const showDay = day !== lastDay;
                  lastDay = day;
                  const mine = m.sender === "admin";
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
                          {mine && m.sender_email && (
                            <div className="text-[11px] text-onInverse/60 mb-0.5">{m.sender_email}</div>
                          )}
                          <div>{m.body}</div>
                          <div className={`text-[10px] mt-1 ${mine ? "text-onInverse/60" : "text-secondary"}`}>
                            {timeLabel(m.created_at)}
                            {mine && m.read_at ? " · Hunter อ่านแล้ว" : ""}
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
                    placeholder="พิมพ์ข้อความถึง Hunter… (Enter เพื่อส่ง, Shift+Enter ขึ้นบรรทัดใหม่)"
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
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
