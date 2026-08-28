import Link from "next/link";

// Shared "เกี่ยวกับ" (About) page content — rendered from both app/about
// (Clinic mode) and app/agency/about (Agency mode) so the two Nav-driven
// routes stay in sync automatically. See components/Nav.tsx's menu-item
// comment for why the twin-route pattern exists.

const WHY_CARDS = [
  {
    n: "1",
    title: "แม่นยำ อ้างอิงกฎหมายจริง",
    body: "วิเคราะห์เทียบกับมาตรา 38 แห่งพระราชบัญญัติสถานพยาบาล พ.ศ. 2541 และแนวทางคำต้องห้ามฉบับล่าสุดของ สบส. ไม่ใช่การเดาแบบทั่วไป",
  },
  {
    n: "2",
    title: "รวดเร็ว ไม่ต้องรอนาน",
    body: "อัปโหลดภาพหรือข้อความแล้วรอผลตรวจได้ในเวลาไม่นาน ไม่ต้องรอผู้เชี่ยวชาญตรวจด้วยตนเองทีละภาพ",
  },
];

const DEMO_FLAGS = [
  {
    quoted: "เก่งที่สุด",
    severity: "ห้ามเด็ดขาด",
    category: "โอ้อวดเกินจริง",
    legalRef: "มาตรา 38 · แนวทางคำต้องห้าม สบส. ปี 2569",
    note: "เข้าข่ายคำโอ้อวดเกินจริงตามแนวทางคำต้องห้ามฉบับปรับปรุงล่าสุด",
  },
  {
    quoted: "การันตีด้วยรางวัลระดับโลก",
    severity: "ห้ามเด็ดขาด",
    category: "โอ้อวดเกินจริง",
    legalRef: "มาตรา 38 · แนวทางคำต้องห้าม สบส. ปี 2569",
    note: "อยู่ในรายชื่อคำต้องห้ามของ สบส. เช่นเดียวกับ “เก่งที่สุด”",
  },
  {
    quoted: "หายขาด 100% ไม่มีผลข้างเคียงใดๆ",
    severity: "ควรระวัง",
    category: "ทำให้เข้าใจผิด",
    legalRef: "มาตรา 38",
    note: "ไม่มีการรักษาใดรับประกันผลได้แน่นอน เข้าข่ายทำให้เข้าใจผิด",
  },
];

const RISK_CARDS = [
  {
    n: "1",
    title: "ถูกสั่งระงับโฆษณากะทันหัน",
    body: "หากเนื้อหาขัดมาตรา 38 แห่งพระราชบัญญัติสถานพยาบาล พ.ศ. 2541 สบส. มีอำนาจสั่งระงับหรือให้ลบโฆษณาได้ทันที แม้จะเผยแพร่ไปแล้ว และในกรณีร้ายแรงอาจสั่งหยุดประกอบกิจการชั่วคราวสูงสุด 15 วัน",
  },
  {
    n: "2",
    title: "เสี่ยงถูกปรับหรือจำคุก",
    body: "โฆษณาที่ไม่ได้รับอนุญาตมีโทษปรับไม่เกิน 20,000 บาท หากเป็นข้อความเท็จหรือโอ้อวดเกินจริง มีโทษจำคุกไม่เกิน 1 ปี หรือปรับไม่เกิน 20,000 บาท หรือทั้งจำทั้งปรับ พร้อมปรับอีกวันละไม่เกิน 10,000 บาท จนกว่าจะระงับโฆษณา",
  },
  {
    n: "3",
    title: "เสียชื่อเสียงและความน่าเชื่อถือ",
    body: "ลูกค้าและสังคมอาจมองว่าแบรนด์ไม่น่าเชื่อถือ และหากผู้ประกอบวิชาชีพเป็นผู้โฆษณาเอง สบส. จะส่งเรื่องให้สภาวิชาชีพพิจารณาโทษเพิ่มเติมตั้งแต่การกระทำผิดครั้งแรก",
  },
  {
    n: "4",
    title: "งบโฆษณาสูญเปล่า",
    body: "ต้องดึงโฆษณาออกกะทันหันและผลิตเนื้อหาใหม่ทั้งหมด ทำให้เสียทั้งเวลา งบประมาณ และกำหนดการแคมเปญที่วางแผนไว้",
  },
  {
    n: "5",
    title: "โทษปรับเพิ่มขึ้นทุกครั้งที่ทำผิดซ้ำ",
    body: "สบส. ใช้บันไดโทษ: ผิดครั้งแรกปรับ 25% ของเพดานสูงสุด (5,000 บาท) ครั้งที่ 2 ปรับ 50% (10,000 บาท) ครั้งที่ 3 ปรับ 75% (15,000 บาท) และครั้งที่ 4 ส่งดำเนินคดีอาญาทันที",
  },
  {
    n: "6",
    title: "เสี่ยงถูกประชาชนแจ้งเบาะแสเอง",
    body: "สบส. อยู่ระหว่างพิจารณาระเบียบ “รางวัลนำจับ” เพื่อจูงใจให้ประชาชนช่วยแจ้งเบาะแสโฆษณาผิดกฎหมาย ทำให้โอกาสถูกตรวจพบไม่ได้จำกัดอยู่แค่การสุ่มตรวจของเจ้าหน้าที่อีกต่อไป",
  },
];

export function AboutContent({ uploadHref = "/upload" }: { uploadHref?: string }) {
  return (
    <main className="bg-page">
      {/* Intro */}
      <section className="bg-surface px-6 md:px-14 py-14 md:py-16">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-3xl md:text-[40px] font-medium tracking-tight text-primary mb-4">
            เกี่ยวกับ AdCheck
          </h1>
          <p className="text-secondary text-base md:text-lg max-w-2xl leading-relaxed">
            เครื่องมือช่วยคัดกรองโฆษณาคลินิกด้วย AI เพื่อให้ทีมการตลาดตรวจสอบเนื้อหาให้สอดคล้องกับมาตรา 38
            และแนวทาง สบส. ได้ง่ายและมั่นใจขึ้น ก่อนเผยแพร่จริงทุกครั้ง
          </p>
        </div>
      </section>

      {/* Story */}
      <section className="bg-surface border-t border-border px-6 md:px-14 py-14 md:py-16">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-14 items-stretch">
          <div className="flex flex-col gap-5">
            <span className="text-tertiary text-sm font-medium">ที่มาของเรา</span>
            <h2 className="text-2xl md:text-[28px] font-medium text-primary">
              เครื่องมือที่เกิดจากปัญหาจริงของคลินิกและเอเจนซี่โฆษณา
            </h2>
            <p className="text-secondary text-[15px] leading-relaxed">
              ทุกวันนี้ทีมการตลาดของคลินิกและเอเจนซี่โฆษณาต้องตรวจสอบข้อความและภาพโฆษณาด้วยสายตาตนเอง
              เทียบกับมาตรา 38 แห่งพระราชบัญญัติสถานพยาบาล พ.ศ. 2541 และแนวทางคำต้องห้ามของกรมสนับสนุนบริการสุขภาพ
              (สบส.) ซึ่งมีการปรับปรุงรายการคำต้องห้ามอยู่เสมอ ล่าสุดคือฉบับปี 2569 ทำให้แม้แต่ทีมที่ระมัดระวังที่สุด
              ก็ยังพลาดใช้คำอย่าง “เก่งที่สุด” “การันตีด้วยรางวัล” หรือ “หายขาด 100%” โดยไม่รู้ตัว และบางครั้งกว่าจะรู้ว่าผิด
              โฆษณาก็เผยแพร่ออกไปแล้วและถูกดำเนินการภายหลัง
            </p>
            <p className="text-secondary text-[15px] leading-relaxed">
              เราจึงพัฒนา AdCheck ให้เป็น AI ที่ช่วยวิเคราะห์ภาพและข้อความโฆษณาอย่างรวดเร็ว จำแนกความเสี่ยงตาม 3
              หมวดที่ สบส. ใช้จริง คือ โอ้อวดเกินจริง ไม่เหมาะสม และทำให้เข้าใจผิด พร้อมอธิบายเหตุผลอ้างอิงตัวบทกฎหมาย
              และแนวทางฉบับล่าสุดอย่างชัดเจน เพื่อให้ทีมการตลาดโพสต์ได้อย่างมั่นใจมากขึ้น โดยยังคงต้องยื่นขออนุมัติกับ
              สบส. ตามขั้นตอนปกติ
            </p>
          </div>
          <div className="rounded-xl overflow-hidden bg-black min-h-[280px] md:min-h-full flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/about/adcheck-about-logo.png"
              alt="AdCheck"
              className="w-full h-full object-contain"
            />
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="bg-surface border-t border-b border-border px-6 md:px-14 py-10">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {[
            ["1,200+", "คลินิกที่ใช้งาน"],
            ["150,000+", "ภาพที่ตรวจสอบแล้ว"],
            ["< 30 วิ", "เวลาเฉลี่ยต่อภาพ"],
            ["มาตรา 38", "อ้างอิงกฎหมายชัดเจน"],
          ].map(([num, label]) => (
            <div key={label}>
              <div className="text-2xl md:text-[32px] font-medium text-primary">{num}</div>
              <div className="text-secondary text-xs md:text-sm mt-1">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Why AdCheck */}
      <section className="bg-surface px-6 md:px-14 py-14 md:py-16">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl md:text-[28px] font-medium text-primary text-center mb-10">
            ทำไมต้อง AdCheck
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
            {WHY_CARDS.map((c) => (
              <div key={c.n} className="rounded-xl border border-border p-7 flex flex-col gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-pill bg-accentSoft text-accent font-medium">
                  {c.n}
                </div>
                <div className="font-medium text-primary">{c.title}</div>
                <p className="text-secondary text-sm leading-relaxed">{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI demo */}
      <section className="bg-page border-t border-border px-6 md:px-14 py-14 md:py-16">
        <div className="max-w-5xl mx-auto">
          <div className="max-w-2xl mx-auto text-center flex flex-col gap-3 mb-10">
            <span className="text-tertiary text-sm font-medium">เทคโนโลยี AI</span>
            <h2 className="text-2xl md:text-[28px] font-medium text-primary">
              AI ช่วยตรวจโฆษณาให้คุณ ก่อนที่ปัญหาจะเกิดขึ้นจริง
            </h2>
            <p className="text-secondary text-[15px] leading-relaxed">
              ทีมการตลาดส่วนใหญ่ยังตรวจสอบโฆษณาด้วยสายตาและประสบการณ์ส่วนตัว ซึ่งใช้เวลานานและมีโอกาสพลาดคำต้องห้าม
              ที่ สบส. ปรับปรุงอยู่เสมอ ตัวอย่างด้านล่างคือการทำงานจริงของเทคโนโลยี AI เมื่อวิเคราะห์ข้อความโฆษณาหนึ่งชิ้น
              แบบเรียลไทม์ พร้อมจำแนกความเสี่ยงและอ้างอิงข้อกฎหมายอย่างชัดเจน
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-xl border border-border bg-surface p-6 flex flex-col gap-4">
              <div className="text-tertiary text-sm font-medium">ข้อความโฆษณาที่ป้อนเข้า AI</div>
              <div className="rounded-md bg-page p-4 text-[15px] text-primary leading-relaxed">
                “คลินิกที่เก่งที่สุดในประเทศไทย การันตีด้วยรางวัลระดับโลก รักษาหายขาด 100%
                ไม่มีผลข้างเคียงใดๆ ทั้งสิ้น ราคาพิเศษวันนี้เท่านั้น!”
              </div>
            </div>

            <div className="rounded-xl border border-border bg-surface p-6 flex flex-col gap-3">
              <div className="text-tertiary text-sm font-medium mb-1">ผลวิเคราะห์จาก AI</div>

              {DEMO_FLAGS.map((f) => (
                <div key={f.quoted} className="bg-page rounded-md p-3 text-sm">
                  <div className="flex items-center justify-between mb-1 gap-2">
                    <span className="font-medium text-primary">&quot;{f.quoted}&quot;</span>
                    <span
                      className={`rounded-pill px-2 py-0.5 text-xs font-medium shrink-0 ${
                        f.severity === "ห้ามเด็ดขาด" ? "bg-dangerSoft text-danger" : "bg-warningSoft text-warning"
                      }`}
                    >
                      {f.severity}
                    </span>
                  </div>
                  <div className="text-secondary text-xs mb-1">
                    {f.category} · {f.legalRef}
                  </div>
                  <p className="text-xs text-secondary leading-relaxed">{f.note}</p>
                </div>
              ))}

              <div className="bg-page rounded-md p-3 text-sm">
                <div className="flex items-center justify-between mb-1 gap-2">
                  <span className="font-medium text-primary">&quot;ราคาพิเศษวันนี้เท่านั้น&quot;</span>
                  <span className="rounded-pill px-2 py-0.5 text-xs font-medium shrink-0 bg-accentSoft text-accent">
                    ผ่าน
                  </span>
                </div>
                <p className="text-xs text-secondary leading-relaxed">
                  เป็นการแจ้งโปรโมชันราคาที่ไม่ขัดต่อกฎหมาย ใช้ได้
                </p>
              </div>

              <div className="rounded-md bg-accentSoft text-accent p-4 text-sm font-medium mt-1">
                สรุปสำหรับทีมการตลาด: พบข้อความเข้าข่ายผิดกฎหมาย 3 จุด จาก 4 ข้อความที่วิเคราะห์ ตามมาตรา 38
                แห่งพระราชบัญญัติสถานพยาบาล พ.ศ. 2541 แนะนำแก้ไขก่อนเผยแพร่ พร้อมข้อความทางเลือกที่ผ่านเกณฑ์ให้ทันที
              </div>
            </div>
          </div>

          <p className="text-tertiary text-xs text-center max-w-2xl mx-auto mt-8">
            อ้างอิง: แนวทางคำต้องห้ามฉบับปรับปรุงปี 2569 และมาตรา 38 แห่งพระราชบัญญัติสถานพยาบาล พ.ศ. 2541
            โดยกรมสนับสนุนบริการสุขภาพ (สบส.)
          </p>
        </div>
      </section>

      {/* Risk of not using AdCheck */}
      <section className="bg-dangerSoft/40 border-t border-border px-6 md:px-14 py-14 md:py-16">
        <div className="max-w-5xl mx-auto">
          <div className="max-w-2xl mx-auto text-center flex flex-col gap-3 mb-10">
            <span className="text-danger text-sm font-medium">ความเสี่ยงทางกฎหมายที่ประเมินได้จริง ไม่ใช่เรื่องสมมติ</span>
            <h2 className="text-2xl md:text-[28px] font-medium text-primary">
              หากไม่ใช้ AdCheck คุณอาจต้องเผชิญกับสิ่งเหล่านี้
            </h2>
            <p className="text-secondary text-[15px] leading-relaxed">
              ปี 2569 กรมสนับสนุนบริการสุขภาพ (สบส.) เพิ่งอัปเดตรายการคำต้องห้าม และอยู่ระหว่างพิจารณาระเบียบ
              “รางวัลนำจับ” ให้ประชาชนช่วยแจ้งเบาะแสโฆษณาผิดกฎหมาย ความเสี่ยงต่อไปนี้จึงสูงกว่าที่หลายคลินิกและเอเจนซี่เข้าใจ
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {RISK_CARDS.map((c) => (
              <div key={c.n} className="rounded-xl border border-border bg-surface p-7 flex flex-col gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-pill bg-dangerSoft text-danger font-medium">
                  {c.n}
                </div>
                <div className="font-medium text-primary">{c.title}</div>
                <p className="text-secondary text-sm leading-relaxed">{c.body}</p>
              </div>
            ))}
          </div>

          <p className="text-tertiary text-xs text-center max-w-2xl mx-auto mt-8">
            ข้อมูลอ้างอิงจากกรมสนับสนุนบริการสุขภาพ (สบส.): มาตรา 38 แห่งพระราชบัญญัติสถานพยาบาล พ.ศ. 2541
            และแนวทางคำต้องห้ามฉบับปรับปรุงปี 2569
          </p>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="bg-inverse flex flex-col items-center gap-5 px-6 md:px-14 py-16 md:py-20 text-center">
        <h2 className="text-2xl md:text-[28px] font-medium text-onInverse max-w-xl">
          พร้อมให้ AdCheck ช่วยตรวจสอบโฆษณาของคุณหรือยัง
        </h2>
        <Link
          href={uploadHref}
          className="rounded-md bg-page text-primary px-8 py-3.5 text-[15px] font-medium hover:bg-page/90"
        >
          เริ่มตรวจสอบเลย
        </Link>
      </section>

      {/* Footer */}
      <footer className="bg-surface flex flex-col items-center gap-2 px-6 md:px-14 py-8 text-xs text-tertiary">
        <p className="max-w-xl text-center">
          AdCheck เป็นเครื่องมือคัดกรองเบื้องต้น ไม่ใช่การอนุมัติโฆษณาตามกฎหมาย สถานพยาบาลยังต้องยื่นขออนุมัติกับ สบส.
          ก่อนเผยแพร่จริงทุกครั้ง
        </p>
        <p className="text-primary text-[13px] font-medium">
          บริษัท แอดพลัส แอดเวอร์ไทซิ่ง จำกัด (ADPLUS ADVERTISING CO., LTD.)
        </p>
        <p>© 2026 ADPLUS ADVERTISING CO., LTD. สงวนลิขสิทธิ์</p>
      </footer>
    </main>
  );
}

export default AboutContent;
