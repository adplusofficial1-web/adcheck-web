export const dynamic = "force-dynamic";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { AddClinicModal } from "@/components/agency/AddClinicModal";
import { getCurrentBusiness } from "@/lib/currentBusiness";
import { getChildClinics, getClinicMonthlyStats, getRecentImagesByBusiness } from "@/lib/agency";

const STATUS_LABEL: Record<string, string> = {
  passed: "ผ่าน",
  caution: "ควรระวัง",
  violation: "เข้าข่ายผิด",
};

function RiskBar({ passed, caution, violation }: { passed: number; caution: number; violation: number }) {
  const total = Math.max(passed + caution + violation, 1);
  return (
    <div className="flex gap-1 h-3 rounded-full overflow-hidden mb-3">
      <div className="bg-accent" style={{ width: (passed / total) * 100 + "%" }} />
      <div className="bg-warning" style={{ width: (caution / total) * 100 + "%" }} />
      <div className="bg-danger" style={{ width: (violation / total) * 100 + "%" }} />
    </div>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length > 1 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}

export default async function AgencyDashboardPage() {
  const business = await getCurrentBusiness();
  if (!business) {
    redirect("/login");
  }

  const clinics = await getChildClinics(business.id);
  const ids = clinics.map((c) => c.id);
  const [stats, recent] = await Promise.all([
    getClinicMonthlyStats(ids),
    getRecentImagesByBusiness(ids, 1),
  ]);

  const totalCredits = clinics.reduce((s, c) => s + c.credits_remaining, 0);
  const totals = { passed: 0, caution: 0, violation: 0 };
  for (const id of ids) {
    const s = stats.get(id)!;
    totals.passed += s.passed;
    totals.caution += s.caution;
    totals.violation += s.violation;
  }
  const totalChecked = totals.passed + totals.caution + totals.violation;

  return (
    <main>
      <Nav credits={totalCredits} />
      <div className="max-w-5xl mx-auto px-6 py-14">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-medium">{business.name}</h1>
            <span className="text-xs font-medium px-3 py-1 rounded-pill bg-accentSoft text-accent">
              เครือข่าย / เอเจนซี่
            </span>
          </div>
          <AddClinicModal />
        </div>
        <p className="text-sm text-secondary mb-8">
          ภาพรวมลูกค้าทั้งหมด {clinics.length} คลินิก — เครดิตและผลตรวจของแต่ละที่แยกจากกัน
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="border border-border rounded-lg p-5">
            <div className="text-xs text-secondary mb-2">เครดิตรวมทุกคลินิก</div>
            <div className="text-2xl font-medium">{totalCredits}</div>
          </div>
          <div className="border border-border rounded-lg p-5">
            <div className="text-xs text-secondary mb-2">ตรวจแล้วเดือนนี้</div>
            <div className="text-2xl font-medium">{totalChecked}</div>
          </div>
          <div className="border border-border rounded-lg p-5">
            <div className="text-xs text-secondary mb-2">ภาพที่ผ่านทั้งหมด</div>
            <div className="text-2xl font-medium">{totals.passed}</div>
          </div>
          <div className="border border-border rounded-lg p-5">
            <div className="text-xs text-secondary mb-2">คลินิกในเครือข่าย</div>
            <div className="text-2xl font-medium">{clinics.length}</div>
          </div>
        </div>

        {clinics.length > 0 && (
          <div className="border border-border rounded-lg p-5 mb-8">
            <div className="text-sm font-medium mb-3">
              ภาพรวมความเสี่ยง — ทุกคลินิกรวมกัน เดือนนี้ ({totalChecked} ภาพ)
            </div>
            <RiskBar passed={totals.passed} caution={totals.caution} violation={totals.violation} />
            <div className="flex gap-6 text-xs text-secondary">
              <span>ผ่าน {totals.passed}</span>
              <span>ควรระวัง {totals.caution}</span>
              <span>เข้าข่ายผิด {totals.violation}</span>
            </div>
          </div>
        )}

        <div className="text-sm font-medium mb-3">คลินิกทั้งหมด — อัปโหลดและติดตามแยกรายที่</div>
        {clinics.length === 0 ? (
          <p className="text-sm text-secondary">
            ยังไม่มีคลินิกในเครือข่าย — กด &quot;เพิ่มคลินิก&quot; ด้านบนเพื่อเริ่มต้น
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {clinics.map((c) => {
              const s = stats.get(c.id)!;
              const total = s.passed + s.caution + s.violation;
              const top = recent.get(c.id)?.[0];
              return (
                <div key={c.id} className="border border-border rounded-lg p-5">
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium shrink-0 bg-accentSoft text-accent">
                        {initials(c.name)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{c.name}</div>
                        <div className="text-xs truncate text-secondary">{c.contact_email || "ยังไม่มีอีเมลติดต่อ"}</div>
                      </div>
                    </div>
                    <Link
                      href={`/upload?business=${c.id}`}
                      className="shrink-0 rounded-md px-3 py-1.5 text-xs font-medium bg-inverse text-onInverse"
                    >
                      + อัปโหลด
                    </Link>
                  </div>
                  <div className="flex items-center justify-between text-xs mb-4">
                    <span className="text-secondary">เครดิตคงเหลือ</span>
                    <span
                      className={`px-3 py-1 font-medium rounded-pill ${
                        c.credits_remaining <= 10 ? "bg-dangerSoft text-danger" : "bg-accentSoft text-accent"
                      }`}
                    >
                      {c.credits_remaining} ครั้ง
                    </span>
                  </div>
                  <div className="text-xs mb-1.5 text-secondary">ผลตรวจเดือนนี้ ({total} ภาพ)</div>
                  <RiskBar passed={s.passed} caution={s.caution} violation={s.violation} />
                  <div className="flex gap-4 text-xs mb-4 text-secondary">
                    <span>ผ่าน {s.passed}</span>
                    <span>ควรระวัง {s.caution}</span>
                    <span>เข้าข่ายผิด {s.violation}</span>
                  </div>
                  {top && (
                    <div className="flex items-center justify-between text-xs pt-3 mb-3 border-t border-border text-secondary">
                      <span className="truncate">{top.filename}</span>
                      <span className="shrink-0">
                        {new Date(top.created_at).toLocaleDateString("th-TH")} · {STATUS_LABEL[top.status] || top.status}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-4 text-xs">
                    <Link href={`/agency/history?clinic=${c.id}`} className="font-medium text-accent">
                      ดูประวัติ →
                    </Link>
                    <Link href={`/agency/settings?clinic=${c.id}`} className="font-medium text-accent">
                      ตั้งค่า →
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
