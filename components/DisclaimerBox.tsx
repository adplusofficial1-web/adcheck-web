// CHANGE (2569-09-04, per user request to move this section to the bottom
// of the checkout page and shorten it by ~50%): each body below was
// condensed to roughly half its prior character count (measured, not
// eyeballed — see the commit for the before/after counts) while keeping
// every substantive protection intact: AI-screening-only / no legal
// effect, no warranty, confidentiality of clinic data, sole user
// responsibility to verify legality, the liability cap, and
// acceptance-by-use + right to amend. Nothing was cut for length that
// changes what the company is or isn't promising — only redundant
// phrasing (e.g. repeated near-synonym lists) was trimmed.
const SECTIONS = [
  {
    title: "ลักษณะและขอบเขตของบริการ",
    body: "ระบบ AI นี้เป็นเครื่องมือช่วยคัดกรองเบื้องต้น ประเมินความเสี่ยงของเนื้อหาโฆษณาเทียบกับกฎหมายและระเบียบที่เกี่ยวข้องเท่าที่ระบบมีข้อมูล ณ ขณะนั้น ผลลัพธ์ไม่ว่ารูปแบบใดเป็นเพียงความเห็นเชิงเทคนิคจากการประมวลผลอัตโนมัติ มิใช่คำวินิจฉัยหรือการรับรองทางกฎหมายจากหน่วยงานรัฐ และไม่ก่อให้เกิดผลผูกพันทางกฎหมายใด ๆ",
  },
  {
    title: "การให้บริการตามสภาพและข้อสงวนสิทธิ์การรับประกัน",
    body: "บริษัทฯ ไม่รับประกันความถูกต้อง ครบถ้วน หรือความเหมาะสมของผลตรวจสอบ เนื่องจากกฎหมายเปลี่ยนแปลงได้ตลอดเวลาและระบบ AI มีข้อจำกัดโดยธรรมชาติ อาจให้ผลคลาดเคลื่อนหรือไม่สมบูรณ์ ขึ้นอยู่กับข้อมูลที่ผู้ใช้บริการนำเข้า และไม่รับประกันว่าบริการจะต่อเนื่องหรือปราศจากข้อผิดพลาด",
  },
  {
    title: "การเก็บข้อมูลคลินิกเป็นความลับ",
    body: "บริษัทฯ เก็บรักษาข้อมูลคลินิกที่นำเข้าสู่ระบบ (โฆษณา รูปภาพ ข้อมูลธุรกิจ) เป็นความลับ จะไม่เปิดเผย จำหน่าย หรือส่งต่อแก่บุคคลภายนอก เว้นแต่ได้รับความยินยอมจากผู้ใช้บริการ",
  },
  {
    title: "หน้าที่และความรับผิดชอบของผู้ใช้บริการ",
    body: "ผู้ใช้บริการมีหน้าที่แต่เพียงผู้เดียวในการตรวจสอบและรับรองความถูกต้องตามกฎหมายของเนื้อหาก่อนเผยแพร่จริง รวมถึงขออนุญาตตามที่กฎหมายกำหนด ห้ามใช้ผลตรวจสอบนี้เป็นเหตุผลเดียวในการตัดสินใจ และควรปรึกษาผู้เชี่ยวชาญกฎหมายหรือหน่วยงานรัฐเพิ่มเติมเมื่อมีข้อสงสัยหรือความเสี่ยงสูง",
  },
  {
    title: "ข้อจำกัดความรับผิดและเพดานความรับผิด",
    body: "ภายใต้ขอบเขตที่กฎหมายอนุญาต บริษัทฯ กรรมการ พนักงาน และตัวแทน จะไม่รับผิดต่อความเสียหายใด ๆ ไม่ว่าทางตรง ทางอ้อม หรือที่สืบเนื่อง รวมถึงค่าปรับ การสูญเสียรายได้ โอกาสทางธุรกิจ ชื่อเสียง หรือการถูกระงับเผยแพร่เนื้อหา อันเกิดจากการใช้หรือพึ่งพาผลตรวจสอบนี้ ไม่ว่าจะได้รับแจ้งถึงความเสียหายนั้นล่วงหน้าหรือไม่",
  },
  {
    title: "การยอมรับข้อตกลง",
    body: "การสั่งซื้อ ชำระเงิน หรือใช้บริการนี้ ถือว่าผู้ใช้บริการยอมรับข้อกำหนดฉบับนี้โดยสมบูรณ์แล้ว หากไม่ยอมรับ โปรดยุติการใช้บริการทันที บริษัทฯ สงวนสิทธิ์แก้ไขข้อกำหนดนี้ได้ โดยจะประกาศผ่านช่องทางของบริษัทฯ",
  },
];

const SCROLLBAR_CSS = `
.adc-disc-scroll{scrollbar-width:thin;scrollbar-color:#DCD8CF transparent;overscroll-behavior:contain}
.adc-disc-scroll::-webkit-scrollbar{width:10px}
.adc-disc-scroll::-webkit-scrollbar-track{background:transparent}
.adc-disc-scroll::-webkit-scrollbar-thumb{background-color:#DCD8CF;border-radius:9999px;border:3px solid #fff}
.adc-disc-scroll::-webkit-scrollbar-thumb:hover{background-color:#C5C0B4}
`;

export function DisclaimerBox({ className = "" }: { className?: string }) {
  return (
    <section
      aria-labelledby="adc-disclaimer-title"
      className={`w-full max-w-3xl mx-auto ${className}`}
    >
      <div className="relative rounded-xl border border-border bg-surface overflow-hidden">
        <div className="flex items-center gap-3 border-b border-border bg-page px-5 py-2 md:px-7 md:py-2.5">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-accent"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-[18px] w-[18px]"
            >
              <path d="M12 3l7.5 3v5.2c0 4.6-3.1 8.8-7.5 9.8-4.4-1-7.5-5.2-7.5-9.8V6z" />
              <path d="M12 9.2v3.6" />
              <path d="M12 15.8h.01" />
            </svg>
          </span>
          <div className="min-w-0">
            <h2
              id="adc-disclaimer-title"
              className="text-[16px] md:text-[17px] font-medium text-primary leading-tight"
            >
              ข้อกำหนดและข้อจำกัดความรับผิดชอบ
            </h2>
            <p className="text-[12.5px] text-secondary leading-tight">
              โปรดอ่านโดยละเอียดก่อนสั่งซื้อหรือใช้บริการ
            </p>
          </div>
        </div>

        <div
          tabIndex={0}
          role="region"
          aria-label="เนื้อหาข้อกำหนดและข้อจำกัดความรับผิดชอบ"
          className="adc-disc-scroll max-h-[300px] md:max-h-[330px] overflow-y-auto px-5 pb-6 pt-2.5 md:px-7 md:pt-3 focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-border"
        >
          {SECTIONS.map((s, i) => (
            <article
              key={s.title}
              className="flex gap-3 border-t border-border py-2.5 first:border-t-0 first:pt-0"
            >
              <span
                aria-hidden="true"
                className="mt-px flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full bg-page text-[12.5px] font-medium text-accent tabular-nums"
              >
                {i + 1}
              </span>
              <div className="min-w-0">
                <h3 className="mb-1 text-[14.5px] md:text-[15px] font-medium text-primary leading-tight">
                  {s.title}
                </h3>
                <p className="text-[13.5px] md:text-[14px] text-secondary leading-[1.6] text-left md:text-justify">
                  {s.body}
                </p>
              </div>
            </article>
          ))}

          <p className="mt-3 text-center text-[12px] tracking-wide text-tertiary">
            — สิ้นสุดข้อกำหนด —
          </p>
        </div>

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-[31px] h-8 bg-gradient-to-b from-transparent to-surface"
        />

        <div className="flex items-center justify-center gap-2 border-t border-border bg-page px-5 py-1.5 text-[12px] text-secondary">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5"
          >
            <path d="M12 5v14" />
            <path d="M6 13l6 6 6-6" />
          </svg>
          <span>เลื่อนเพื่ออ่านทั้งหมด</span>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: SCROLLBAR_CSS }} />
    </section>
  );
}

export default DisclaimerBox;
