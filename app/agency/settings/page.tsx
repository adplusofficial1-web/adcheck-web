export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { ClinicSettingsCard } from "@/components/agency/ClinicSettingsCard";
import { getCurrentBusiness } from "@/lib/currentBusiness";
import { getChildClinics } from "@/lib/agency";

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

  return (
    <main>
      <Nav credits={clinics.reduce((s, c) => s + c.credits_remaining, 0)} />
      <div className="max-w-2xl mx-auto px-6 py-14">
        <h1 className="text-2xl font-medium mb-2">ตั้งค่าคลินิก — แยกรายที่</h1>
        <p className="text-sm text-secondary mb-8">
          แก้ไขข้อมูลและซื้อ/เติมแพ็กเกจของแต่ละคลินิกได้อิสระ ไม่กระทบคลินิกอื่นในเครือข่าย
        </p>
        {ordered.length === 0 ? (
          <p className="text-sm text-secondary">
            ยังไม่มีคลินิกในเครือข่าย — เพิ่มคลินิกได้จากหน้า Dashboard
          </p>
        ) : (
          <div className="space-y-6">
            {ordered.map((c) => (
              <ClinicSettingsCard key={c.id} clinic={c} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
