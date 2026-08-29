import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getCurrentPlatformAdminEmail } from "@/lib/platformAdmin";
import { AdminNav } from "@/components/admin/AdminNav";

// Platform Admin area — separate from the clinic-facing Nav/layout
// entirely (no clinic/agency mode toggle, no credits badge, none of that
// applies here). Only reachable by emails listed in ADMIN_EMAILS
// (lib/platformAdmin.ts) — everyone else, including a fully signed-in
// clinic account, sees the "ไม่มีสิทธิ์" message below rather than a
// redirect loop through /login.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.email) {
    redirect("/login?callbackUrl=/admin/knowledge-base");
  }

  const adminEmail = await getCurrentPlatformAdminEmail();
  if (!adminEmail) {
    return (
      <div className="min-h-screen bg-page flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <p className="text-lg font-medium text-primary">ไม่มีสิทธิ์เข้าถึงหน้านี้</p>
          <p className="mt-2 text-sm text-secondary">
            บัญชี {session.user.email} ไม่ได้อยู่ในรายชื่อผู้ดูแลระบบ (ADMIN_EMAILS) —
            ติดต่อทีม AD Plus หากคิดว่านี่เป็นความผิดพลาด
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-page print:bg-white">
      {/* print:hidden — this admin chrome has no business appearing when a
          nested page opens the browser's print dialog (see
          app/admin/knowledge-base/[id]/pdf/page.tsx, the only page under
          /admin that currently does), so it's dropped from the printed
          output the same way results/[id]/pdf's standalone layout already
          keeps Nav out of its own printouts. */}
      <header className="bg-inverse text-onInverse px-6 md:px-14 py-5 print:hidden">
        <div className="flex items-center justify-between gap-6 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="text-2xl font-medium">ADCheck</span>
            <span className="rounded-pill bg-white/10 border border-onInverse/30 px-3 py-1 text-xs">
              Admin
            </span>
          </div>
          <AdminNav />
          <span className="text-sm text-onInverse/70">{adminEmail}</span>
        </div>
      </header>
      <main className="px-6 md:px-14 py-10 print:p-0">{children}</main>
    </div>
  );
}
