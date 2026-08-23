export const dynamic = "force-dynamic";
import Link from "next/link";
import { getPlans } from "@/lib/db";

export default async function LandingPage() {
  let plans: any[] = [];
  try {
    plans = await getPlans();
  } catch {
    plans = [];
  }

  return (
    <main>
      <nav className="flex items-center justify-between px-14 py-6">
        <span className="text-base font-medium">ADCheck</span>
        <div className="flex items-center gap-3 text-sm">
          <Link href="/login" className="px-4 py-2">
            เข้าสู่ระบบ
          </Link>
          <Link href="/onboarding" className="rounded-md bg-inverse text-onInverse px-4 py-2">
            ทดลองใช้ฟรี
          </Link>
        </div>
      </nav>

      <section className="max-w-3xl mx-auto text-center px-6 py-20">
        <span className="inline-block rounded-pill bg-accentSoft text-accent text-xs font-medium px-3 py-1 mb-6">
          ตรวจสอบโฆษณาคลินิกสถานพยาบาลด้วย AI
        </span>
        <h1 className="text-4xl font-medium leading-tight mb-6">
          โฆษณาคลินิกให้ถูกกฎหมาย
          <br />
          ก่อนเผยแพร่จริง
        </h1>
        <p className="text-secondary mb-8">
          อัปโหลดภาพโฆษณา ให้ AI ตรวจตามแนวทาง สบส. ก่อนเผยแพร่จริง
          พร้อมคำอธิบายว่าผิดตรงไหนและควรแก้อย่างไร
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link href="/onboarding" className="rounded-md bg-inverse text-onInverse px-6 py-3 text-sm font-medium">
            เริ่มตรวจสอบฟรี
          </Link>
          <Link href="/pricing" className="text-sm underline">
            ดูตัวอย่างผลตรวจ →
          </Link>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 py-16 border-t border-border">
        <h2 className="text-center text-xl font-medium mb-12">ใช้งานง่ายใน 3 ขั้นตอน</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          {[
            ["1", "อัปโหลดภาพโฆษณา", "ลากภาพหรือเลือกไฟล์ที่ต้องการตรวจสอบ"],
            ["2", "AI ตรวจตามแนวทาง สบส.", "วิเคราะห์คำและภาพเทียบกับมาตรา 38 และคู่มือโฆษณาฉบับล่าสุด"],
            ["3", "รับผลพร้อมคำแนะนำ", "เห็นจุดที่เสี่ยง เหตุผลอ้างอิงกฎหมาย และวิธีแก้ไขทันที"],
          ].map(([n, title, desc]) => (
            <div key={n}>
              <div className="text-2xl font-medium mb-3">{n}</div>
              <div className="font-medium mb-1">{title}</div>
              <div className="text-sm text-secondary">{desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 py-16 border-t border-border">
        <h2 className="text-center text-xl font-medium mb-12">ราคาแพ็กเกจรายเดือน</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((p) => (
            <div
              key={p.id}
              className={`rounded-lg border p-6 ${p.is_popular ? "border-accent" : "border-border"}`}
            >
              {p.is_popular && (
                <span className="inline-block rounded-pill bg-accentSoft text-accent text-xs font-medium px-3 py-1 mb-3">
                  ยอดนิยม
                </span>
              )}
              <div className="font-medium mb-1">{p.name}</div>
              <div className="text-3xl font-medium mb-1">
                {Number(p.price_thb).toLocaleString()}
                <span className="text-sm font-normal text-secondary"> บาท/เดือน</span>
              </div>
              <div className="text-sm text-secondary mb-4">
                {p.monthly_image_credits} รูปภาพ/เดือน
              </div>
              <ul className="text-sm space-y-1 mb-6">
                {(p.features || []).map((f: string) => (
                  <li key={f}>✓ {f}</li>
                ))}
              </ul>
              <Link
                href="/onboarding"
                className={`block text-center rounded-md px-4 py-2 text-sm font-medium ${
                  p.is_popular ? "bg-inverse text-onInverse" : "border border-border"
                }`}
              >
                เลือกแพ็กนี้
              </Link>
            </div>
          ))}
        </div>
      </section>

      <footer className="bg-inverse text-onInverse text-center py-12 mt-8">
        <h3 className="text-lg font-medium mb-4">เริ่มตรวจสอบโฆษณาคลินิกของคุณวันนี้</h3>
        <Link href="/onboarding" className="inline-block rounded-md bg-white text-inverse px-5 py-3 text-sm font-medium">
          ทดลองใช้ฟรี 5 ครั้ง
        </Link>
      </footer>
    </main>
  );
}
