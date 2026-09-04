import { redirect } from "next/navigation";
import { headers } from "next/headers";
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
    // FIX (bug audit round 2, low): this used to hardcode
    // callbackUrl=/admin/knowledge-base regardless of which admin page was
    // actually requested. middleware.ts now forwards the real requested
    // path via the x-pathname header (see its comment) — fall back to the
    // knowledge base only if that header is somehow missing.
    const requestedPath = (await headers()).get("x-pathname") || "/admin/knowledge-base";
    redirect(`/login?callbackUrl=${encodeURIComponent(requestedPath)}`);
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
    <div className="min-h-screen bg-page">
      <header className="bg-inverse text-onInverse px-6 md:px-14 py-5">
        <div className="flex items-center justify-between gap-6 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="text-2xl font-medium">ADCheck</span>
            <span className="rounded-pill bg-white/10 border border-onInverse/30 px-3 py-1 text-xs">
              Admin
            </span>
          </div>
          <AdminNav />
          {/* fix(mobile): the admin email is a single unbreakable string
              with no truncate, sitting in the same flex-wrap row as the
              5-tab AdminNav pill — on a narrow phone it competed for
              space with the tabs and could push them around. Hidden below
              sm (same breakpoint HunterShell.tsx already hides its own
              user email at) and truncated so a long address can't force
              the header wider than the viewport at sm/md either. */}
          <span className="hidden sm:block text-sm text-onInverse/70 truncate max-w-[220px]">{adminEmail}</span>
        </div>
      </header>
      <main className="px-6 md:px-14 py-10">{children}</main>
    </div>
  );
}
