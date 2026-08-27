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
    <main className="bg-page">
      <nav className="bg-inverse text-onInverse flex items-center justify-between px-16 py-7">
        <span className="text-2xl font-medium">ADCheck</span>
        <div className="flex items-center gap-8">
          <Link href="#pricing" className="text-xl text-onInverse/90 hover:text-onInverse">
            ราคา
          </Link>
          <Link href="/case-studies" className="text-xl text-onInverse/90 hover:text-onInverse">
            ตัวอย่างผลตรวจ
          </Link>
          <Link href="/login" className="text-xl text-onInverse/90 hover:text-onInverse">
            เข้าสู่ระบบ
          </Link>
          <Link
            href="/login"
            className="rounded-md bg-surface text-primary px-5 py-2.5 text-base font-medium hover:bg-surface/90"
          >
            ทดลองใช้ฟรี
          </Link>
        </div>
      </nav>

      <section className="bg-surface flex flex-col md:flex-row items-center gap-16 px-16 py-[100px]">
        <div className="w-full md:w-[46%] rounded-2xl overflow-hidden border border-border shadow-[0_20px_50px_-20px_rgba(27,27,24,0.18)]">
          <video autoPlay muted loop playsInline className="block w-full h-full object-cover">
            <source src="/hero/adcheck-hero.webm" type="video/webm" />
            <source src="/hero/adcheck-hero.mp4" type="video/mp4" />
          </video>
        </div>
        <div className="flex flex-col items-start gap-6 text-left">
          <span className="inline-block rounded-pill bg-accentSoft text-accent text-xs font-medium tracking-wide px-3.5 py-1.5">
            ตรวจสอบโฆษณาคลินิกสถานพยาบาลด้วย AI
          </span>
          <h1 className="max-w-full w-[560px] text-[46px] font-medium leading-[1.16] tracking-tight text-primary">
            โฆษณาคลินิกให้ถูกกฎหมาย
            <br />
            ก่อนเผยแพร่จริง
          </h1>
          <p className="max-w-full w-[480px] text-secondary text-lg leading-[1.6]">
            อัพโหลดภาพโฆษณา ให้ AI ตรวจตามแนวทาง สบส. ก่อนเผยแพร่จริง
            พร้อมคำอธิบายว่าผิดตรงไหนและควรแก้อย่างไร
          </p>
          <div className="flex items-center gap-6 pt-3">
            <Link
              href="/login"
              className="rounded-md bg-inverse text-onInverse px-8 py-4 text-[15px] font-medium hover:bg-inverse/90"
            >
              เริ่มตรวจสอบฟรี
            </Link>
            <Link href="/case-studies" className="text-[15px] text-primary underline">
              ดูตัวอย่างผลตรวจ →
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-surface border-t border-border flex flex-col items-center gap-14 px-16 py-20">
        <h2 className="text-[28px] font-medium text-primary">ใช้งานง่ายใน 3 ขั้นตอน</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          {[
            ["1", "อัพโหลดภาพโฆษณา", "ลากภาพหรือเลือกไฟล์ที่ต้องการตรวจสอบ สูงสุด 5 ภาพต่อครั้ง"],
            ["2", "AI ตรวจตามแนวทาง สบส.", "วิเคราะห์คำและภาพเทียบกับมาตรา 38 และคู่มือโฆษณาฉบับล่าสุด"],
            ["3", "รับผลพร้อมคำแนะนำ", "เห็นจุดที่เสี่ยง เหตุผลอ้างอิงกฎหมาย และวิธีแก้ไขทันที"],
          ].map(([n, title, desc]) => (
            <div key={n} className="w-full md:w-[400px] flex flex-col gap-3">
              <div className="text-[40px] font-extrabold text-primary">{n}</div>
              <div className="text-lg font-medium text-primary">{title}</div>
              <div className="text-sm text-secondary leading-[1.55]">{desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" className="bg-surface border-t border-border flex flex-col items-center gap-12 px-16 py-[100px]">
        <h2 className="text-[28px] font-medium text-primary text-center">
          ราคาแพ็กเกจรายเดือน - เลือกตามการใช้งาน
        </h2>
        <div className="flex flex-col md:flex-row gap-6 items-start">
          {plans.map((p) => (
            <div
              key={p.id}
              className={`w-full md:w-[280px] rounded-xl border p-7 md:p-8 flex flex-col gap-4 ${
                p.is_popular ? "border-2 border-accent" : "border-border"
              }`}
            >
              {p.is_popular && (
                <span className="inline-block w-fit rounded-pill bg-accentSoft text-primary text-[11px] font-medium underline px-3 py-1">
                  ยอดนิยม
                </span>
              )}
              <div className="text-sm text-primary">{p.name}</div>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-medium text-primary">
                  {Number(p.price_thb).toLocaleString()}
                </span>
                <span className="text-sm text-secondary">บาท/เดือน</span>
              </div>
              <div className="text-sm text-secondary">{Number(p.monthly_image_credits).toLocaleString()} รูปภาพ/เดือน</div>
              <ul className="text-xs text-secondary flex flex-col gap-2">
                {(p.features || []).map((f: string) => (
                  <li key={f} className="flex items-center gap-2">
                    <span className="text-accent">✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/login"
                className={`block text-center rounded-md px-4 py-3 text-sm font-medium ${
                  p.is_popular
                    ? "bg-inverse text-onInverse"
                    : "border border-borderStrong text-primary"
                }`}
              >
                เลือกแพ็กนี้
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-inverse flex flex-col items-center gap-5 px-16 py-24">
        <h3 className="text-[28px] font-medium text-onInverse">เริ่มตรวจสอบโฆษณาคลินิกของคุณวันนี้</h3>
        <Link
          href="/login"
          className="rounded-md bg-page text-primary px-8 py-3.5 text-[15px] font-medium hover:bg-page/90"
        >
          ทดลองใช้ฟรี 5 ครั้ง
        </Link>
      </section>

      <footer className="bg-surface flex flex-col items-center gap-2 px-16 py-8 text-xs text-tertiary">
        <p className="max-w-full w-[600px] text-center">
          AdCheck เป็นเครื่องมือคัดกรองเบื้องต้น ไม่ใช่การอนุมัติโฆษณาตามกฎหมาย
          สถานพยาบาลยังต้องยื่นขออนุมัติกับ สบส. ก่อนเผยแพร่จริงทุกครั้ง
        </p>
        <p>© 2026 AdCheck</p>
      </footer>
    </main>
  );
}
