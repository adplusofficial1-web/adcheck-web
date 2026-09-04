// FAQPage structured data + a visible accordion, sharing one array so the
// two never drift apart. Every answer below restates a fact that already
// exists elsewhere in the codebase (upload limits in lib/uploadLimits.ts,
// specialty list in lib/specialties.ts, the DBD badge in
// DbdTrustBadge.tsx, the "screening tool, not legal approval" disclaimer
// already in this page's footer) — nothing here is a new claim invented
// for SEO purposes. Pricing is intentionally left un-hardcoded (points to
// #pricing instead) since plan prices come from the DB and can change.
//
// SEO: FAQPage schema is the structured-data format Google/AI Overviews
// pull from most directly for question-shaped queries — see "3. กลยุทธ์
// คีย์เวิร์ด" (bottom-funnel product questions) in
// claude/adcheck-seo-strategy.md.
const FAQS: { question: string; answer: string }[] = [
  {
    question: "AdCheck คืออะไร",
    answer:
      "AdCheck คือเครื่องมือ AI ที่ช่วยตรวจสอบภาพโฆษณาคลินิก/สถานพยาบาล ก่อนเผยแพร่จริง โดยวิเคราะห์คำและภาพเทียบกับมาตรา 38 พ.ร.บ.สถานพยาบาล และแนวทางโฆษณาของ สบส. พร้อมอธิบายว่าจุดไหนเสี่ยงผิดกฎหมายและควรแก้อย่างไร",
  },
  {
    question: "AdCheck ตรวจสอบโฆษณาได้กี่ภาพต่อครั้ง รองรับไฟล์แบบไหน",
    answer:
      "อัปโหลดได้สูงสุด 10 ภาพต่อการตรวจสอบ 1 ครั้ง รองรับไฟล์ JPG, PNG และ PDF ขนาดไม่เกิน 10MB ต่อไฟล์",
  },
  {
    question: "AdCheck ใช้ได้กับคลินิกสาขาไหนบ้าง",
    answer:
      "รองรับคลินิก/สถานพยาบาลกว่า 18 สาขา เช่น คลินิกความงาม ทันตกรรม กระดูกและข้อ ผิวหนัง สูตินรีเวช กุมารเวช จิตเวช สัตวแพทย์ ร้านขายยา และโรงพยาบาล รวมถึงหมวด \"อื่น ๆ\" สำหรับสาขาที่ไม่อยู่ในลิสต์",
  },
  {
    question: "ผลตรวจจาก AdCheck เท่ากับได้รับอนุมัติจาก สบส. แล้วหรือไม่",
    answer:
      "ไม่ใช่ AdCheck เป็นเครื่องมือคัดกรองเบื้องต้นเท่านั้น ไม่ใช่การอนุมัติโฆษณาตามกฎหมาย สถานพยาบาลยังต้องยื่นขออนุมัติกับ สบส. ก่อนเผยแพร่จริงทุกครั้ง",
  },
  {
    question: "ทดลองใช้ AdCheck ฟรีได้ไหม ราคาเท่าไหร่",
    answer:
      "สมัครแล้วทดลองใช้ฟรีได้ 15 ครั้งทันที หลังจากนั้นเลือกแพ็กเกจรายเดือนตามปริมาณการใช้งานได้ที่ส่วนราคาด้านบนของหน้านี้",
  },
  {
    question: "AdCheck น่าเชื่อถือแค่ไหน",
    answer:
      "AdCheck จดทะเบียนพาณิชย์อิเล็กทรอนิกส์กับกรมพัฒนาธุรกิจการค้า (DBD) ถูกต้องตามกฎหมาย",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((f) => ({
    "@type": "Question",
    name: f.question,
    acceptedAnswer: { "@type": "Answer", text: f.answer },
  })),
};

export function FaqSection() {
  return (
    <section className="bg-surface border-t border-border flex flex-col items-center gap-10 px-6 md:px-16 py-16 md:py-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <h2 className="text-[28px] font-medium text-primary text-center">คำถามที่พบบ่อย</h2>
      <div className="w-full max-w-[720px] flex flex-col gap-3">
        {FAQS.map((f) => (
          <details
            key={f.question}
            className="group rounded-lg border border-border px-5 py-4 open:bg-page"
          >
            <summary className="cursor-pointer list-none text-[15px] font-medium text-primary flex items-center justify-between gap-4">
              {f.question}
              <span className="text-tertiary text-lg leading-none group-open:rotate-45 transition-transform shrink-0">
                +
              </span>
            </summary>
            <p className="text-sm text-secondary leading-[1.6] mt-3">{f.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
