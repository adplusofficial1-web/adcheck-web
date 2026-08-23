import Link from "next/link";

const OPTIONS = [
  {
    key: "clinic",
    title: "คลินิก",
    desc: "ดูแลโฆษณาของคลินิกตัวเองเพียงแห่งเดียว",
    bullets: ["จัดการเครดิตและประวัติของคลินิกเดียว", "ไม่ต้องสลับบัญชีไปมา", "เหมาะกับนักการตลาดในคลินิก"],
  },
  {
    key: "agency",
    title: "เอเจนซี่",
    desc: "ดูแลโฆษณาให้คลินิกหลายแห่งพร้อมกัน",
    bullets: ["สลับดูลูกค้าหลายรายในบัญชีเดียว", "เชิญทีมงานเข้ามาช่วยกันดูแล", "ออกใบกำกับภาษีรวมทุกลูกค้า"],
  },
];

export default function OnboardingPage({
  searchParams,
}: {
  searchParams: { type?: string };
}) {
  const selected = searchParams.type ?? "clinic";

  return (
    <main className="min-h-screen">
      <nav className="px-14 py-6">
        <span className="text-base font-medium">ADCheck</span>
      </nav>
      <div className="max-w-3xl mx-auto text-center px-6 py-10">
        <h1 className="text-2xl font-medium mb-2">เลือกการใช้งานที่เหมาะกับคุณ</h1>
        <p className="text-sm text-secondary mb-10">
          เลือกประเภทบัญชีให้ตรงกับการใช้งานจริง — เปลี่ยนภายหลังได้ในหน้าตั้งค่า
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10 text-left">
          {OPTIONS.map((o) => (
            <Link
              key={o.key}
              href={`/onboarding?type=${o.key}`}
              className={`rounded-lg border p-6 ${
                selected === o.key ? "border-accent" : "border-border"
              }`}
            >
              <div className={`h-10 w-10 rounded-full mb-4 ${selected === o.key ? "bg-accent" : "bg-accentSoft"}`} />
              <div className="font-medium mb-1">{o.title}</div>
              <div className="text-sm text-secondary mb-4">{o.desc}</div>
              <ul className="text-sm space-y-1">
                {o.bullets.map((b) => (
                  <li key={b}>✓ {b}</li>
                ))}
              </ul>
            </Link>
          ))}
        </div>
        <Link
          href="/dashboard"
          className="block w-full rounded-md bg-inverse text-onInverse py-3 text-sm font-medium"
        >
          ดำเนินการต่อ
        </Link>
      </div>
    </main>
  );
}
