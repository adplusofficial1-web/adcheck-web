export const dynamic = "force-dynamic";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { AddClinicModal } from "@/components/agency/AddClinicModal";
import { getCurrentBusiness } from "@/lib/currentBusiness";
import {
  getChildClinics,
  getClinicMonthlyStats,
  getRecentImagesByBusiness,
  hasActiveAgencyPlan,
} from "@/lib/agency";

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
  // Gates the "+ อัพโหลด" button on every clinic card below — see
  // lib/agency.ts:hasActiveAgencyPlan. Only the upload action is gated;
  // everything else here (viewing stats, adding clinics, drilling into
  // history/settings) stays available regardless.
  const agencyPlanActive = hasActiveAgencyPlan(business);
  const [stats, recent] = await Promise.all([
    getClinicMonthlyStats(ids),
    getRecentImagesByBusiness(ids, 1),
  ]);

  // The agency's own credits_remaining IS the shared pool every clinic
  // below draws from — not a sum of per-clinic balances (those columns are
  // unused for billing now, see lib/agency.ts:hasActiveAgencyPlan).
  const totalCredits = business.credits_remaining;
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
          ภาพรวมลูกค้าทั้งหมด {clinics.length} คลินิก — ผลตรวจของแต่ละที่แยกจากกัน แต่ใช้เครดิตรวมจากแพ็กเกจ Agency เดียว
        </p>

        {!agencyPlanActive && (
          <div className="rounded-lg border border-warning bg-warningSoft p-5 mb-8 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm font-medium mb-1">ยังไม่ได้สมัครแพ็กเกจ Agency</p>
              <p className="text-sm text-secondary">
                บัญชีนี้ยังไม่ได้สมัคร หรือแพ็กเกจ Agency (หลายสาขา) หมดอายุแล้ว — สมัครหรือต่ออายุเพื่อปลดล็อกปุ่ม
                &quot;อัพโหลด&quot; ให้ทุกคลินิกในเครือข่ายด้านล่าง
              </p>
            </div>
            <Link
              href="/checkout?plan=agency"
              className="shrink-0 rounded-md bg-inverse text-onInverse px-4 py-2.5 text-sm font-medium"
            >
              สมัคร/ต่ออายุ →
            </Link>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="border border-border rounded-lg p-5">
            <div className="text-xs text-secondary mb-2">เครดิตคงเหลือ (ฉ้ร่วมกันทุกคลินิก)</div>
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

        <div className="text-sm font-medium mb-3">คลินิกทั้งหมด — อัพโหลดและติดตามแยกรายที่</div>
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
                      href={agencyPlanActive ? `/agency/upload?business=${c.id}` : "/checkout?plan=agency"}
                      // No active Agency plan on this account — this points
                      // at checkout instead of upload, same as the banner
                      // above, but keeps the exact same look as the normal
                      // upload button (no lock icon / muted styling) rather
                      // than visibly marking it as disabled.
                      //
                      // CHANGE: points at /agency/upload (not /upload) so
                      // clicking this stays in Agency-mode Nav chrome — see
                      // app/agency/upload/page.tsx.
                      title={agencyPlanActive ? undefined : "ต้องสมัครแพ็กเกจ Agency ก่อนอัพโหลดให้คลินิกในเครือข่าย"}
                      className="shrink-0 rounded-md px-3 py-1.5 text-xs font-medium bg-inverse text-onInverse"
                    >
                      + อัพโหลด
                    </Link>
                  </div>
                  <div className="flex items-center justify-between text-xs mb-4">
                    <span className="text-secondary">เครดิตที่ใช้ไป</span>
                    <span className="px-3 py-1 font-medium rounded-pill bg-accentSoft text-accent">
                      {total} ครั้ง
                    </span>
                  </div>
                  <div className="text-xs mb-1.5 text-secondary">ผลีรวจเดือนนี้ ({total} ภาพ)</div>
                  <RiskBar passed={s.passed} caution={s.caution} violation={s.violation} />
                  <div className="flex gap-4 text-xs mb-4 text-secondary">
                    <span>ผ่าน {s.passed}</span>
                    <span>ควรระวัง {s.caution}</span>
                    <span>เข้าข่าผิด {s.violation}</span>
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
