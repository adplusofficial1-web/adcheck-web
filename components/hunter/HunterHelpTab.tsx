// /hunter's "วิธีการใช้งาน" tab — new, per user request (2569-09-01,
// "เพิ่มหน้าวิธีการใช้งาน"). Static reference content only (no fetch, no
// state) explaining what each of the other tabs does and how referral
// attribution + commission actually work, since that mechanic (a clinic
// only ever counts as "yours" via the referral link cookie — see
// lib/currentBusiness.ts) isn't obvious just from looking at the other
// tabs. Numbers/rates below (30% / 5%) are read from lib/hunterCommission.ts
// (FIRST_PAYMENT_RATE / TRAILING_RATE) — keep this copy in sync if those
// ever change.

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <span className="text-sm font-medium text-primary">{title}</span>
      <div className="mt-2.5 text-sm text-secondary leading-relaxed space-y-2">{children}</div>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5">
      <span className="shrink-0 w-5 h-5 rounded-full bg-accentSoft text-accent text-xs font-medium flex items-center justify-center mt-0.5">
        {n}
      </span>
      <span>{children}</span>
    </div>
  );
}

export function HunterHelpTab() {
  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <p className="text-sm text-secondary">สรุปการใช้งานแต่ละหน้าและวิธีคำนวณค่าคอมมิชชั่น สำหรับ Hunter ทุกคน</p>

      <Section title="ลิงก์แนะนำของคุณ — หัวใจของระบบ">
        <p>
          คลินิกจะนับเป็นของคุณก็ต่อเมื่อคลิกลิงก์แนะนำเฉพาะของคุณ (ดูได้ที่แท็บ Dashboard) แล้วสมัครเข้าใช้งานครั้งแรกผ่านลิงก์นั้นเท่านั้น
          — ระบบจะจำไว้ตั้งแต่วินาทีนั้นแบบถาวร ต่อให้ภายหลังคุณจะไม่ได้ใช้งานแล้วก็ตาม
        </p>
        <p>ดังนั้นก่อนส่งลิงก์ให้คลินิกเป้าหมาย ควรแนะนำให้เขาคลิกลิงก์ของคุณโดยตรง ไม่ใช่ค้นหาแล้วเข้าเว็บเอง</p>
      </Section>

      <Section title="Dashboard">
        <p>ภาพรวมยอดคลินิกที่แนะนำ, ค่าคอมมิชชั่นสะสม/รอจ่าย/จ่ายแล้ว, กราฟค่าคอมมิชชั่นรายวัน-รายเดือน และลิงก์แนะนำของคุณ</p>
      </Section>

      <Section title="Pipeline">
        <p>
          พื้นที่ทำงานส่วนตัวของคุณ — คลินิกทุกรายที่แอดมิน &quot;ส่ง&quot; มาให้ทีม Hunter (คลินิกเดียวกันอาจมี Hunter คนอื่นเห็นด้วย
          แต่สถานะ/โน้ตที่คุณบันทึกจะเห็นเฉพาะคุณคนเดียว) จัดเรียงเป็น 6 ขั้นตอน:
        </p>
        <div className="flex flex-col gap-1.5 mt-1">
          <Step n={1}>ส่งมาแล้ว — ยังไม่ได้ติดต่อ</Step>
          <Step n={2}>ติดต่อแล้ว — เริ่มคุยแล้ว</Step>
          <Step n={3}>สนใจ — มีท่าทีสนใจใช้บริการ</Step>
          <Step n={4}>ปิดได้ — ปิดการขายสำเร็จ</Step>
          <Step n={5}>ปิดไม่ได้ — ไม่สนใจ/ปิดการขายไม่สำเร็จ</Step>
          <Step n={6}>ไม่ตอบรับ — ติดต่อไม่ได้/เงียบหาย</Step>
        </div>
        <p>กดปุ่มสถานะบนการ์ดเพื่อย้ายขั้นตอน และพิมพ์โน้ต (เช่น เบอร์ติดต่อ, นัดหมาย) ไว้ในช่องโน้ตของแต่ละใบได้เลย ระบบบันทึกอัตโนมัติ</p>
      </Section>

      <Section title="ค่าคอมมิชชั่น & การรับเงิน">
        <p>คลินิกที่สมัครผ่านลิงก์แนะนำของคุณ จะสร้างค่าคอมมิชชั่นให้คุณทุกครั้งที่เขาชำระเงินสำเร็จ:</p>
        <div className="flex flex-col gap-1.5 mt-1">
          <Step n={1}>การชำระเงินครั้งแรกของคลินิกนั้น — ได้ 30% ของยอดชำระ</Step>
          <Step n={2}>การชำระเงินทุกครั้งถัดไป (รวมต่ออายุรายเดือนอัตโนมัติ) — ได้ 5% ตลอดไป</Step>
        </div>
        <p>
          ตั้งค่าช่องทางรับเงิน (พร้อมเพย์หรือบัญชีธนาคาร) ไว้ในแท็บนี้ให้เรียบร้อย ทีมแอดมินจะโอนค่าคอมมิชชั่นตามรอบจ่ายที่ตกลงกัน
        </p>
      </Section>

      <Section title="ตั้งค่า">
        <p>แก้ไขชื่อ-นามสกุล, เบอร์โทร, LINE ID, รูปประจำตัว และข้อมูลสำหรับออกเอกสารภาษี (เลขผู้เสียภาษี/ที่อยู่) เมื่อมีการโอนค่าคอมมิชชั่น</p>
      </Section>

      <p className="text-xs text-tertiary">มีคำถามเพิ่มเติม ติดต่อทีม AD Plus ได้โดยตรง</p>
    </div>
  );
}
