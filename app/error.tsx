"use client";

import Link from "next/link";
import { useEffect } from "react";

// Bug Audit 4 (2569-09-02): app-wide error boundary. Before this, any
// uncaught server-side exception showed Next.js's default English
// "Application error: a server-side exception has occurred" text. The
// underlying error stays in the server logs (and Next's digest is shown
// here so support can correlate); the visitor gets a Thai explanation, a
// retry, and a way back.
export default function GlobalRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="min-h-screen bg-page flex flex-col items-center justify-center px-6 text-center">
      <Link href="/" className="text-2xl font-medium text-primary mb-8">
        ADCheck
      </Link>
      <h1 className="text-lg font-medium text-primary mb-2">เกิดข้อผิดพลาดชั่วคราว</h1>
      <p className="max-w-md text-sm text-secondary mb-2">
        ระบบไม่สามารถแสดงหน้านี้ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง หากยังเกิดขึ้นซ้ำ
        แจ้งทีม AD Plus พร้อมรหัสด้านล่างได้เลย
      </p>
      {error.digest && <p className="text-xs text-tertiary mb-8">รหัสอ้างอิง: {error.digest}</p>}
      <div className="flex items-center gap-4 text-sm mt-4">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-md bg-inverse text-onInverse px-5 py-2.5 font-medium"
        >
          ลองใหม่
        </button>
        <Link href="/dashboard" className="underline text-primary">
          ไปหน้า Dashboard
        </Link>
      </div>
    </main>
  );
}
