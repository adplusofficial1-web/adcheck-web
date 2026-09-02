import Link from "next/link";

// Bug Audit 4 (2569-09-02): until now the app had no not-found.tsx at all, so
// every 404 — a mistyped /share/<token>, an old /articles/<slug>, /agency/upload
// opened without ?business=, the removed /admin/inside — rendered Next.js's
// bare black "404 | This page could not be found." screen in English with no
// branding and no way back. This is the single app-wide replacement; every
// `notFound()` call in the tree lands here.
export default function NotFound() {
  return (
    <main className="min-h-screen bg-page flex flex-col items-center justify-center px-6 text-center">
      <Link href="/" className="text-2xl font-medium text-primary mb-8">
        ADCheck
      </Link>
      <p className="text-6xl font-medium text-primary mb-3">404</p>
      <h1 className="text-lg font-medium text-primary mb-2">ไม่พบหน้าที่ต้องการ</h1>
      <p className="max-w-md text-sm text-secondary mb-8">
        ลิงก์นี้อาจพิมพ์ผิด หมดอายุ หรือรายการถูกลบไปแล้ว — ถ้าเป็นลิงก์ผลตรวจที่ได้รับมา
        กรุณาขอลิงก์ใหม่จากผู้ที่ส่งให้
      </p>
      <div className="flex items-center gap-4 text-sm">
        <Link href="/dashboard" className="rounded-md bg-inverse text-onInverse px-5 py-2.5 font-medium">
          ไปหน้า Dashboard
        </Link>
        <Link href="/" className="underline text-primary">
          หน้าแรก
        </Link>
      </div>
    </main>
  );
}
