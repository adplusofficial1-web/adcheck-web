import Link from "next/link";

export const metadata = {
  title: "ตัวอย่างการตรวจสอบโฆษณา — AdCheck",
  description:
    "ตัวอย่างจริงว่า AI ของ AdCheck ตรวจจับข้อความโฆษณาที่เข้าข่ายผิดกฎหมายอย่างไร พร้อมคำอธิบายและตัวอย่างการแก้ไขที่ใช้ได้จริง",
  // SEO audit (OpenRush, 2569-09-05): flagged as missing a self-referencing
  // canonical, same as the other clinic-mode pages fixed alongside this one.
  alternates: {
    canonical: "/case-studies",
  },
};

// Shared scrollbar + bottom fade for the "scroll for more" panel below.
// Same visual language as components/DisclaimerBox.tsx (adc-disc-scroll) —
// kept page-scoped here since this is the only page that needs it at this
// width/height.
const SCROLLBAR_CSS = `
.adc-cs-scroll{scrollbar-width:thin;scrollbar-color:#DCD8CF transparent;overscroll-behavior:contain}
.adc-cs-scroll::-webkit-scrollbar{width:10px}
.adc-cs-scroll::-webkit-scrollbar-track{background:transparent}
.adc-cs-scroll::-webkit-scrollbar-thumb{background-color:#DCD8CF;border-radius:9999px;border:3px solid #fff}
.adc-cs-scroll::-webkit-scrollbar-thumb:hover{background-color:#C5C0B4}
`;

type Compare = {
  riskText: string;
  riskPoints: string[];
  passText: string;
  passPoints: string[];
};

// These are illustrative example ad copy (not real customer submissions or
// quotes) written to demonstrate how the AI review reads against มาตรา 38
// and สบส. guidance — kept deliberately generic/unattributed so this page
// never implies a specific clinic or customer said these things. See C1 in
// claude/UX Audit Findings.md: this page used to also show a "1,200+
// clinics trust us" stat plus fabricated named case studies and
// testimonials, which were removed as dishonest — the product has only a
// couple of real test accounts so far.
const COMPARE_EXAMPLES: Compare[] = [
  {
    riskText: "รักษาสิว หายขาด 100% การันตีผลลัพธ์ดีที่สุดในไทย ปลอดภัย ไม่มีผลข้างเคียงแน่นอน",
    riskPoints: [
      "“หายขาด 100%” เข้าข่ายโอ้อวดสรรพคุณเกินจริง",
      "“การันตีผลลัพธ์ดีที่สุดในไทย” เป็นการเปรียบเทียบที่ไม่มีหลักฐานรับรอง",
      "“ไม่มีผลข้างเคียงแน่นอน” ขัดแย้งกับข้อเท็จจริงทางการแพทย์",
    ],
    passText: "ดูแลปัญหาสิวโดยทีมแพทย์ผู้เชี่ยวชาญ พร้อมให้คำปรึกษาเฉพาะบุคคล ผลลัพธ์แตกต่างกันไปในแต่ละบุคคล",
    passPoints: [
      "ไม่มีการโอ้อวดสรรพคุณหรือรับประกันผลลัพธ์",
      "ระบุผลลัพธ์แตกต่างกันในแต่ละบุคคลตามหลักการแพทย์",
      "สอดคล้องกับมาตรา 38 และแนวทาง สบส.",
    ],
  },
  {
    riskText: "ฉีดโบท็อกซ์เห็นผลทันที หน้าเรียวเล็กลงถาวร ไม่ต้องฉีดซ้ำตลอดชีวิต",
    riskPoints: [
      "“เห็นผลทันที” ทำให้เข้าใจผิดเรื่องระยะเวลาแสดงผลจริง",
      "“ถาวร...ไม่ต้องฉีดซ้ำ” ขัดแย้งกับกลไกการออกฤทธิ์ของโบทูลินัมท็อกซิน",
      "ไม่มีการระบุว่าต้องดำเนินการโดยแพทย์ผู้เชี่ยวชาญ",
    ],
    passText: "ฉีดโบท็อกซ์ปรับรูปหน้าโดยแพทย์ผู้เชี่ยวชาญ ผลลัพธ์เห็นได้ใน 1-2 สัปดาห์ และควรฉีดซ้ำตามคำแนะนำแพทย์",
    passPoints: [
      "ระบุระยะเวลาแสดงผลตามความเป็นจริง",
      "ระบุว่าต้องดำเนินการโดยแพทย์ผู้เชี่ยวชาญ",
      "ไม่มีการอ้างผลลัพธ์ถาวรเกินจริง",
    ],
  },
  {
    riskText: "กินยาลดน้ำหนักตัวนี้ ผอมเร็ว 5 กิโลใน 7 วัน ไม่ต้องคุมอาหารไม่ต้องออกกำลังกาย",
    riskPoints: [
      "อ้างสรรพคุณลดน้ำหนักโดยไม่มีหลักฐานทางวิทยาศาสตร์รองรับ",
      "เข้าข่ายโฆษณาผลิตภัณฑ์เสริมอาหารเกินจริงตาม พ.ร.บ.อาหาร",
      "ไม่มีคำเตือนเรื่องผลข้างเคียงหรือข้อควรระวัง",
    ],
    passText: "ควบคุมน้ำหนักด้วยโปรแกรมดูแลจากแพทย์ ควบคู่กับการปรับพฤติกรรมการกินและออกกำลังกาย ผลลัพธ์ขึ้นอยู่กับแต่ละบุคคล",
    passPoints: [
      "ไม่มีการอ้างตัวเลขลดน้ำหนักที่เกินจริง",
      "ระบุว่าต้องอยู่ภายใต้การดูแลของแพทย์",
      "แจ้งว่าผลลัพธ์แตกต่างกันในแต่ละบุคคล",
    ],
  },
  {
    riskText: "จัดฟันใส เห็นผลไว ฟันเรียงสวยใน 3 เดือน การันตีไม่ต้องถอนฟัน 100%",
    riskPoints: [
      "“การันตี...100%” เป็นการรับประกันผลการรักษาซึ่งขึ้นอยู่กับสภาพฟันแต่ละคน",
      "ระยะเวลาการจัดฟันแตกต่างกันในแต่ละเคส ไม่ควรระบุตายตัว",
      "อ้างว่าไม่ต้องถอนฟันโดยไม่ผ่านการวินิจฉัยจริง",
    ],
    passText: "จัดฟันใสโดยทันตแพทย์เฉพาะทาง วางแผนการรักษาเฉพาะบุคคลหลังการวินิจฉัย ระยะเวลาและผลลัพธ์ขึ้นอยู่กับสภาพฟันของแต่ละคน",
    passPoints: [
      "ไม่มีการการันตีผลลัพธ์ที่ตายตัว",
      "ระบุว่าต้องผ่านการวินิจฉัยจากทันตแพทย์ก่อน",
      "แจ้งว่าระยะเวลาแตกต่างกันในแต่ละบุคคล",
    ],
  },
  {
    riskText: "ผ่าตัดเลสิค ไม่เจ็บ ปลอดภัย 100% มองเห็นชัดตลอดชีวิตไม่ต้องใส่แว่นอีกเลย",
    riskPoints: [
      "“ปลอดภัย 100%” ขัดแย้งกับความเสี่ยงที่มีอยู่จริงในการผ่าตัดทุกชนิด",
      "“ตลอดชีวิต” ไม่ครอบคลุมกรณีสายตาเปลี่ยนแปลงตามอายุ",
      "ไม่มีการระบุข้อบ่งชี้หรือข้อจำกัดของการรักษา",
    ],
    passText: "ผ่าตัดเลสิคโดยจักษุแพทย์ผู้เชี่ยวชาญ พร้อมตรวจประเมินสภาพดวงตาก่อนการรักษา ผลลัพธ์และความเสี่ยงแตกต่างกันในแต่ละบุคคล",
    passPoints: [
      "ไม่มีการอ้างความปลอดภัยแบบเบ็ดเสร็จ",
      "ระบุขั้นตอนการประเมินก่อนรักษาอย่างชัดเจน",
      "แจ้งเตือนเรื่องความแตกต่างของผลลัพธ์ในแต่ละบุคคล",
    ],
  },
  {
    riskText: "ปลูกผมถาวร คืนผมหนาใน 1 เดือน รับรองผมไม่ร่วงอีกตลอดชีวิต",
    riskPoints: [
      "ระยะเวลาการขึ้นผมจริงใช้เวลานานหลายเดือนถึงเป็นปี ไม่ใช่ 1 เดือน",
      "“รับรอง...ตลอดชีวิต” เป็นการรับประกันผลที่ไม่มีหลักฐานทางการแพทย์รองรับ",
      "ไม่ระบุว่าผลลัพธ์ขึ้นอยู่กับสาเหตุผมร่วงของแต่ละบุคคล",
    ],
    passText: "ปลูกผมโดยแพทย์ผู้เชี่ยวชาญเฉพาะทาง ผมเริ่มขึ้นใหม่ในช่วง 3-6 เดือน ผลลัพธ์ขึ้นอยู่กับสาเหตุและสภาพเส้นผมของแต่ละบุคคล",
    passPoints: [
      "ระบุระยะเวลาที่สอดคล้องกับหลักการแพทย์",
      "ไม่มีการรับประกันผลลัพธ์ตลอดชีวิต",
      "แจ้งว่าผลลัพธ์ขึ้นอยู่กับสาเหตุของแต่ละบุคคล",
    ],
  },
  {
    riskText: "ฉีดวิตามินทางเส้นเลือด ล้างพิษตับ ต้านมะเร็ง ผิวขาวใสใน 3 วัน",
    riskPoints: [
      "“ต้านมะเร็ง” เป็นการอ้างสรรพคุณทางการแพทย์ที่ร้ายแรงโดยไม่มีหลักฐานรองรับ",
      "“ล้างพิษตับ” ไม่ใช่ข้อบ่งชี้ทางการแพทย์ที่ได้รับการยอมรับ",
      "อ้างระยะเวลาเห็นผลผิวขาวที่เกินจริง",
    ],
    passText: "บริการฉีดวิตามินทางเส้นเลือดโดยแพทย์ เสริมความสดชื่นและบำรุงร่างกาย ผลลัพธ์แตกต่างกันไปในแต่ละบุคคล ไม่ใช่การรักษาโรค",
    passPoints: [
      "ไม่มีการอ้างสรรพคุณรักษาโรคร้ายแรง",
      "ไม่มีการอ้างระยะเวลาเห็นผลที่ตายตัว",
      "ระบุชัดว่าไม่ใช่การรักษาทางการแพทย์",
    ],
  },
  {
    riskText: "ฉีดฟิลเลอร์ปากกระจับ จมูกโด่งสวยเป๊ะ ราคาถูกที่สุดในกรุงเทพ การันตีไม่บวมไม่ช้ำ",
    riskPoints: [
      "“ราคาถูกที่สุดในกรุงเทพ” เป็นการเปรียบเทียบราคาที่ไม่มีหลักฐานอ้างอิง",
      "“การันตีไม่บวมไม่ช้ำ” ขัดแย้งกับผลข้างเคียงที่อาจเกิดขึ้นได้จริง",
      "ไม่มีการระบุว่าต้องทำโดยแพทย์ผู้เชี่ยวชาญ",
    ],
    passText: "ฉีดฟิลเลอร์ปรับรูปหน้าโดยแพทย์ผู้เชี่ยวชาญ ให้คำปรึกษาออกแบบเฉพาะบุคคล อาจมีอาการบวมช้ำได้ตามปกติหลังทำหัตถการ",
    passPoints: [
      "ไม่มีการเปรียบเทียบราคาที่ไม่มีหลักฐาน",
      "แจ้งผลข้างเคียงที่อาจเกิดขึ้นตามจริง",
      "ระบุว่าต้องดำเนินการโดยแพทย์ผู้เชี่ยวชาญ",
    ],
  },
  {
    riskText: "เครื่องสลายไขมันด้วยความเย็น ลดไขมันเฉพาะจุดถาวร ไม่ต้องผ่าตัดไม่ต้องพักฟื้น เห็นผล 100%",
    riskPoints: [
      "“ถาวร” และ “เห็นผล 100%” เป็นการรับประกันผลลัพธ์เกินจริง",
      "ไม่มีการระบุว่าต้องทำหลายครั้งจึงเห็นผล",
      "ไม่มีคำเตือนเรื่องข้อจำกัดของเทคโนโลยี",
    ],
    passText: "เทคโนโลยีสลายไขมันเฉพาะจุด ควบคู่กับคำแนะนำจากแพทย์ ผลลัพธ์ขึ้นอยู่กับสภาพร่างกายและจำนวนครั้งที่เข้ารับบริการ",
    passPoints: [
      "ไม่มีการอ้างผลลัพธ์ถาวรหรือเห็นผล 100%",
      "ระบุเงื่อนไขจำนวนครั้งที่ต้องเข้ารับบริการ",
      "แจ้งว่าผลลัพธ์ขึ้นอยู่กับสภาพร่างกายแต่ละคน",
    ],
  },
  {
    riskText: "ครีมทาผิวขาวใสใน 3 วัน ปลอดภัย 100% ไม่มีสารอันตราย รับรองผลหรือคืนเงิน",
    riskPoints: [
      "อ้างระยะเวลาผิวขาวที่รวดเร็วเกินจริงและไม่มีหลักฐานรองรับ",
      "“ปลอดภัย 100% ไม่มีสารอันตราย” เป็นการรับประกันที่เกินจริง",
      "“รับรองผลหรือคืนเงิน” เข้าข่ายการรับประกันสรรพคุณสินค้า",
    ],
    passText: "ครีมบำรุงผิวช่วยให้ผิวดูกระจ่างใสขึ้นเมื่อใช้ต่อเนื่อง ผ่านการทดสอบความปลอดภัยตามมาตรฐาน ผลลัพธ์แตกต่างกันไปในแต่ละบุคคล",
    passPoints: [
      "ไม่มีการอ้างระยะเวลาเห็นผลที่ตายตัว",
      "ไม่มีการรับประกันผลลัพธ์แบบคืนเงิน",
      "แจ้งว่าผลลัพธ์แตกต่างกันในแต่ละบุคคล",
    ],
  },
];

function ScrollHint({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 mt-3 rounded-pill bg-page px-3 py-1.5 text-[12.5px] font-medium text-tertiary">
      แสดงทั้งหมด {count} ตัวอย่าง — เลื่อนลงเพื่อดูเพิ่มเติม
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M1 3.5L5 7.5L9 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export default function CaseStudiesPage() {
  return (
    <main className="bg-page">
      <nav className="bg-inverse text-onInverse flex items-center justify-between gap-4 flex-wrap px-6 md:px-16 py-5 md:py-7">
        <Link href="/" className="text-2xl font-medium">
          ADCheck
        </Link>
        <div className="flex items-center gap-4 md:gap-8 flex-wrap">
          <Link href="/login" className="text-base md:text-xl text-onInverse/90 hover:text-onInverse">
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

      <div className="bg-surface flex flex-col items-start gap-3 px-6 md:px-16 pt-16 pb-12">
        <p className="text-tertiary text-sm">
          <Link href="/" className="hover:text-primary">หน้าแรก</Link> &nbsp;/&nbsp; ตัวอย่างการตรวจสอบ
        </p>
        <h1 className="text-[30px] md:text-[44px] font-medium text-primary">ตัวอย่างการตรวจสอบโฆษณา</h1>
        <p className="max-w-[720px] text-secondary text-lg leading-[1.6]">
          ดูตัวอย่างจริงว่า AI ของ AdCheck จับจุดเสี่ยงในข้อความโฆษณาและช่วยแนะนำการแก้ไขอย่างไร
          ก่อนเผยแพร่โฆษณาจริง
        </p>
      </div>

      {/* Before / After Showcase */}
      <div className="bg-surface flex flex-col items-start gap-7 px-6 md:px-16 pb-20">
        <div>
          <p className="text-[28px] font-medium text-primary mb-1.5">ตัวอย่างการตรวจสอบ</p>
          <p className="max-w-[640px] text-secondary text-[15px] leading-snug">
            ตัวอย่างข้อความโฆษณาสมมติ ใช้เพื่อสาธิตวิธีที่ AI วิเคราะห์เทียบกับมาตรา 38 และแนวทาง สบส. —
            ไม่ใช่โฆษณาจริงของคลินิกใดคลินิกหนึ่ง
          </p>
          <ScrollHint count={COMPARE_EXAMPLES.length} />
        </div>

        <div className="relative w-full">
          <div className="adc-cs-scroll max-h-[640px] overflow-y-auto pr-3 -mr-3">
            <div className="flex flex-col gap-6">
              {COMPARE_EXAMPLES.map((ex, i) => (
                <div key={i} className="flex flex-wrap gap-6">
                  <div className="w-full sm:flex-1 sm:min-w-[380px] rounded-xl border-2 border-dangerSoft p-6 flex flex-col gap-4">
                    <span className="inline-flex w-fit rounded-pill bg-dangerSoft text-danger text-xs font-medium px-3 py-1.5">
                      ⚠ พบ 3 จุดเสี่ยง — ก่อนตรวจสอบ
                    </span>
                    <div className="rounded-[10px] bg-page px-5 py-4 text-[14px] leading-relaxed text-primary">
                      {ex.riskText}
                    </div>
                    <div>
                      <p className="text-[13px] font-medium text-danger mb-2">จุดที่ AI ตรวจพบ</p>
                      <ul className="flex flex-col gap-2 text-[13px] text-secondary">
                        {ex.riskPoints.map((p, j) => (
                          <li key={j} className="flex gap-2">
                            <span className="text-danger">•</span>
                            <span>{p}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="w-full sm:flex-1 sm:min-w-[380px] rounded-xl border-2 border-accentSoft p-6 flex flex-col gap-4">
                    <span className="inline-flex w-fit rounded-pill bg-accentSoft text-accent text-xs font-medium px-3 py-1.5">
                      ✓ ผ่านเกณฑ์ — หลังแก้ไขโดย AdCheck
                    </span>
                    <div className="rounded-[10px] bg-page px-5 py-4 text-[14px] leading-relaxed text-primary">
                      {ex.passText}
                    </div>
                    <div>
                      <p className="text-[13px] font-medium text-accent mb-2">เหตุผลที่ผ่านเกณฑ์</p>
                      <ul className="flex flex-col gap-2 text-[13px] text-secondary">
                        {ex.passPoints.map((p, j) => (
                          <li key={j} className="flex gap-2">
                            <span className="text-accent">•</span>
                            <span>{p}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-b from-transparent to-surface rounded-b-xl" />
        </div>
      </div>

      <div className="bg-inverse flex flex-col items-center gap-5 px-6 md:px-16 py-24">
        <h2 className="text-[28px] font-medium text-onInverse text-center max-w-[600px]">
          อยากตรวจโฆษณาของคุณแบบนี้บ้างไหม ลองใช้ AdCheck วันนี้
        </h2>
        <Link
          href="/login"
          className="rounded-md bg-page text-primary px-8 py-3.5 text-[15px] font-medium hover:bg-page/90"
        >
          ทดลองใช้ฟรี 15 ครั้ง
        </Link>
      </div>

      <footer className="bg-surface flex flex-col items-center gap-2 px-6 md:px-16 py-8 text-xs text-tertiary">
        <p className="max-w-full w-[600px] text-center">
          AdCheck เป็นเครื่องมือคัดกรองเบื้องต้น ไม่ใช่การอนุมัติโฆษณาตามกฎหมาย
          สถานพยาบาลยังต้องยื่นขออนุมัติกับ สบส. ก่อนเผยแพร่จริงทุกครั้ง
        </p>
        <p>© 2026 AdCheck</p>
      </footer>

      <style dangerouslySetInnerHTML={{ __html: SCROLLBAR_CSS }} />
    </main>
  );
}
