export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { UploadForm } from "./UploadForm";
import { Nav } from "@/components/Nav";
import { getCurrentBusiness } from "@/lib/currentBusiness";

export default async function UploadPage() {
  const business = await getCurrentBusiness();
  if (!business) {
    redirect("/login");
  }

  return (
    <main>
      <Nav credits={business?.credits_remaining ?? 0} />
      <div className="max-w-2xl mx-auto px-6 py-14">
        <h1 className="text-2xl font-medium mb-2">อัปโหลดภาพโฆษณา</h1>
        <p className="text-sm text-secondary mb-8">
          เลือกได้สูงสุด 5 ภาพต่อครั้ง รองรับ JPG, PNG, PDF ไม่เกิน 10MB ต่อไฟล์
        </p>
        <UploadForm creditsRemaining={business?.credits_remaining ?? 0} />
      </div>
    </main>
  );
}
