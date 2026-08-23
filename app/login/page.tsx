import Link from "next/link";

export default function LoginPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6">
      <Link href="/" className="text-base font-medium mb-10">
        ADCheck
      </Link>
      <div className="w-full max-w-sm border border-border rounded-lg p-8 text-center">
        <h1 className="text-xl font-medium mb-2">เข้าสู่ระบบ</h1>
        <p className="text-sm text-secondary mb-8">
          เข้าสู่ระบบด้วยบัญชี Google เพื่อจัดการการตรวจสอบโฆษณาของคุณ
        </p>
        {/*
          NOTE: this is a UI stub. Wiring real Google OAuth requires a
          Google Cloud OAuth client + NextAuth (or similar) configuration,
          which needs credentials only the project owner can create.
        */}
        <Link
          href="/dashboard"
          className="flex items-center justify-center gap-2 rounded-md border border-border px-4 py-3 text-sm font-medium hover:bg-page"
        >
          เข้าสู่ระบบด้วย Google
        </Link>
        <p className="text-xs text-tertiary mt-6">
          ยังไม่มีบัญชี?{" "}
          <Link href="/onboarding" className="underline">
            เริ่มต้นใช้งานฟรี
          </Link>
        </p>
      </div>
    </main>
  );
}
