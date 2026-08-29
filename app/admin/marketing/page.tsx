import { listMarketingAssociations } from "@/lib/marketingAssociations";
import { MarketingTracker } from "@/components/admin/MarketingTracker";

// Same reasoning as app/admin/credits/page.tsx's dynamic export — an admin
// updating a card's phase/status and immediately checking the board wants
// the current rows, not a cached list.
export const dynamic = "force-dynamic";

export default async function MarketingPage() {
  const associations = await listMarketingAssociations();

  return (
    <div className="max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-medium text-primary">Marketing</h1>
        <p className="mt-2 text-sm text-secondary max-w-2xl">
          ติดตามสถานะการติดต่อสมาคมวิชาชีพ — เฟส 1: ส่งข้อมูลฟรี → เฟส 2: ลิง์ทดลองใช้ → เฟส 3: พูดในงานสมาคม → เฟส 4: MOU
          ส่วนลดทางการ
        </p>
      </div>

      <div className="mt-8">
        <MarketingTracker initialAssociations={associations} />
      </div>
    </div>
  );
}
