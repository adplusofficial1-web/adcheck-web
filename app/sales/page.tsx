import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getCurrentSalesUser } from "@/lib/currentSalesUser";
import { DAILY_QUOTA } from "@/lib/salesLeads";
import { SalesLeadList } from "@/components/sales/SalesLeadList";

// A sales rep's own dashboard — see claude/Sales Lead Distribution -
// Design.md for the full feature writeup. Deliberately its own small
// layout (not sharing app/admin/layout.tsx or the clinic Nav) since a
// sales rep is neither a platform admin nor a clinic/business account —
// see lib/currentSalesUser.ts for why this never touches getCurrentBusiness().
export default async function SalesPage() {
  const session = await auth();
  if (!session?.user?.email) {
    redirect("/sales/login");
  }

  const salesUser = await getCurrentSalesUser();
  if (!salesUser) {
    // Signed in with Google, but not (or no longer) an active sales_users
    // row — same "signed in but not authorized" treatment
    // app/admin/layout.tsx gives a non-admin, rather than bouncing back to
    // /sales/login (which would just succeed again and land here again).
    return (
      <div className="min-h-screen bg-page flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <p className="text-lg font-medium text-primary">ยังไม่ได้รับสิทธิ์เข้าใช้งาน</p>
          <p className="mt-2 text-sm text-secondary">
            บัญชี {session.user.email} ยังไม่อยู่ในรายชื่อเซลล์ที่แอดมินเพิ่มไว้ (หรือถูกปิดใช้งานอยู่) —
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
            <span className="rounded-pill bg-white/10 border border-onInverse/30 px-3 py-1 text-xs">Sales</span>
          </div>
          <span className="text-sm text-onInverse/70">
            {salesUser.name} · {salesUser.email}
          </span>
        </div>
      </header>
      <main className="px-6 md:px-14 py-10 max-w-3xl mx-auto">
        <div>
          <h1 className="text-2xl font-medium text-primary">Lead ของฉัน</h1>
          <p className="mt-2 text-sm text-secondary max-w-2xl">
            รายชื่อคลินิกที่ Hunter ตรวจพบปัญหาแล้ว ระบบจะเติมให้ครบ {DAILY_QUOTA} รายชื่อที่เปิดอยู่ทุกวันโดยอัตโนมัติ
            — กดเปลี่ยนสถานะและบันทึกโน้ตได้เลยเมื่อคุณติดต่อลูกค้า
          </p>
        </div>
        <div className="mt-6">
          <SalesLeadList />
        </div>
      </main>
    </div>
  );
}
