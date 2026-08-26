export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { ClinicSettingsCard } from "@/components/agency/ClinicSettingsCard";
import { getCurrentBusiness } from "@/lib/currentBusiness";
import { getChildClinics, getClinicMonthlyStats } from "@/lib/agency";

export default async function AgencySettingsPage({
  searchParams,
}: {
  searchParams: { clinic?: string };
}) {
  const business = await getCurrentBusiness();
  if (!business) {
    redirect("/login");
  }

  const clinics = await getChildClinics(business.id);
  // Pin the clinic someone drilled in from (e.g. the dashboard card's
  // "ตั้งค่า →" link) to the top of the list, same ordering the demo used.
  const ordered = [...clinics].sort((a, b) =>
    a.id === searchParams.clinic ? -1 : b.id === searchParams.clinic ? 1 : 0
  );
  const stats = await getClinicMonthlyStats(clinics.map((c) => c.id));

  return (
    <main>
      {/* Shows the agency's own credits_remaining — the single shared pool
          every clinic below draws from, not a sum of per-clinic balances
          (child clinics no longer have their own). */}
      <Nav credits={business.credits_remaining} />
      <div className="max-w-2xl mx-auto px-6 py-14">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-2">
          <h1 className="text-2xl font-medium">ตั้งค่าคลินิก — แยกรายที่</h1>
          <Link
            href="/checkout?plan=agency"
            className="shrink-0 rounded-md bg-inverse text-onInverse px-4 py-2.5 text-sm font-medium"
          >
            จัดการแพ็กเกจ Agency →
          </Link>
        </div>
        <p className="text-sm text-secondary mb-8">
          แก้ไขข้อมูลของแต่ละคลินิกได้อิสระ — เครดิตใช้ร่วมกันจากแพ็กเกจ Agency เดียว ไม่ได้แยกต่อคลินิก
        </p>
        {ordered.length === 0 ? (
          <p className="text-sm text-secondary">
            ยังไม่มีคลินิกในเครือข่าย — เพิ่มคลินิกได้จากหน้า Dashboard
          </p>
        ) : (
          <div className="space-y-6">
            {ordered.map((c) => {
              const s = stats.get(c.id);
              const checksThisMonth = (s?.passed ?? 0) + (s?.caution ?? 0) + (s?.violation ?? 0);
              return (
                <ClinicSettingsCard key={c.id} clinic={c} checksThisMonth={checksThisMonth} />
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
