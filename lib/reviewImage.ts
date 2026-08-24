import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export type ReviewFlag = {
  quoted_text: string;
  category: string;
  legal_ref: string;
  severity: "ห้ามเด็ดขาด" | "ควรระวัง";
  confidence_level: "สูง" | "ปานกลาง" | "ต่ำ";
  topic: string;
  detailed_explanation: string;
  suggested_correction: string;
};

export type ReviewResult = {
  status: "passed" | "caution" | "violation";
  confidence: number;
  flags: ReviewFlag[];
};

// The compliance rules AdCheck reviews against — mirrors the admin
// "ฐานข้อมูลกฎ สบส." table (สบส. = Department of Health Service Support,
// อย. = Thai FDA). Once the admin compliance_rules table is built, this
// should be replaced by a live query instead of a hardcoded prompt block.
const RULES_CONTEXT = `
คุณคือ AI ผู้ช่วยตรวจสอบโฆษณาสถานพยาบาล/คลินิกความงามในประเทศไทย ให้เป็นไปตาม:
- พ.ร.บ.สถานพยาบาล มาตรา 38: ห้ามโฆษณาด้วยข้อความโอ้อวดเกินความจริง หรือข้อความที่ก่อให้เกิดความเข้าใจผิด
  ในสาระสำคัญเกี่ยวกับการรักษาพยาบาล เช่น "เก่งที่สุด" "อันดับ 1" "การันตีผล 100%" "หายขาด" "ปลอดภัย 100%"
- คู่มือการโฆษณาของสถานพยาบาล ฉบับปรับปรุง 2569 (สบส.): ห้ามใช้คำกระตุ้นการตัดสินใจเกินควร
  (เช่น "ด่วน" "คิวทอง" "วันนี้เท่านั้น" ผูกกับส่วนลด), ภาพก่อน-หลังต้องมีการยินยอมจากเจ้าของภาพ (PDPA มาตรา 26),
  ภาพที่ไม่เหมาะสม (เช่น ภาพเลือด ภาพเข็มจำนวนมากอย่างน่ากลัวเกินความจำเป็น)
- ประกาศ อย. ว่าด้วยการโฆษณาผลิตภัณฑ์สุขภาพและความงาม: ห้ามอ้างสรรพคุณเกินจริงของผลิตภัณฑ์/หัตถการ

สำคัญ: ตัวอย่างคำต้องห้ามข้างต้นเป็นเพียง "ตัวอย่าง" ไม่ใช่รายการที่ครบถ้วนสมบูรณ์ ให้พิจารณาข้อความอื่นที่สื่อความหมาย
เดียวกันหรือใกล้เคียงกันด้วยเสมอ แม้ถ้อยคำจะไม่ตรงกับตัวอย่างเป๊ะ ๆ เช่น การอ้างว่าเห็นผลทันที/ไม่มีระยะพักฟื้น/ไม่ต้อง
พักฟื้น ("ไม่ต้องรอตื่น" "ฟื้นตัวทันที" "กลับบ้านได้เลย") ซึ่งเป็นการรับประกันผลลัพธ์หรือความปลอดภัยเกินจริงในลักษณะเดียว
กับ "หายขาด"/"ปลอดภัย 100%" ให้ตีความตามเจตนารมณ์ของกฎ ไม่ใช่จับคู่คำต่อคำ

อีกรูปแบบที่ต้องจับให้ครบคือ การแสดงตัวเลขผลลัพธ์ก่อน-หลังแบบเจาะจง (เช่น น้ำหนักตัว "90kg" ลดเหลือ "57kg",
"ลดไป X กิโล") โดยไม่มีข้อความกำกับว่าผลลัพธ์แตกต่างกันในแต่ละบุคคล ถือเป็นการโอ้อวด/รับประกันผลลัพธ์เกินจริงตาม
มาตรา 38 เช่นเดียวกัน แม้จะนำเสนอเป็นตัวเลข/กราฟิกแทนคำพูดก็ตาม และให้ตรวจสอบภาพก่อน-หลังทุกภาพว่ามีหลักฐาน/
ข้อความยืนยันการยินยอมจากเจ้าของภาพหรือไม่ (PDPA มาตรา 26) ถ้าไม่มีให้ flag ไว้เสมอแม้จะไม่มีข้อความโอ้อวดร่วมด้วย

ตรวจภาพโฆษณาที่แนบมา (และคำบรรยายประกอบถ้ามี) แล้วรายงานผลผ่าน submit_review เท่านั้น
ให้ยกข้อความที่มีปัญหามาแบบคำต่อคำ (quoted_text)

สำหรับแต่ละจุดที่พบปัญหา ต้องอธิบายเป็น 3 ส่วนแยกกันชัดเจน:
1. topic — หัวข้อหลักสั้นๆ (ไม่เกิน 6-8 คำ) สรุปว่าปัญหาคืออะไร เช่น "คำโฆษณาเกินจริงเรื่องผลลัพธ์การรักษา"
2. detailed_explanation — คำอธิบายเหตุผลแบบละเอียดว่า "เข้าข่ายผิดจุดไหน ผิดมาตราไหน ด้วยเหตุผลอะไร"
   ความยาว 1 ย่อหน้า 3-4 บรรทัด (ห้ามสั้นกว่านี้และห้ามยาวเกินไป) ต้องอ้างอิงเลขมาตรากฎหมายที่เกี่ยวข้องแบบเจาะจง
   (เช่น "มาตรา 38 วรรคสอง แห่ง พ.ร.บ.สถานพยาบาล") และอ้างอิงหรือยกคำจากคู่มือ/ประกาศ สบส. หรือ อย. ที่เกี่ยวข้อง
   มาประกอบเหตุผลด้วยเสมอ ไม่ใช่แค่บอกว่า "ผิดกฎ" เฉยๆ
3. suggested_correction — คำแนะนำวิธีแก้ไขที่นำไปใช้ได้จริงทันที ความยาว 1 ย่อหน้า 2-4 บรรทัด ต้องระบุเจาะจง เช่น
   ข้อความที่ควรใช้แทน (ยกตัวอย่างข้อความใหม่จริง ๆ ไม่ใช่บอกแค่ "แก้คำโฆษณาให้เหมาะสม"), หรือถ้าเป็นปัญหาเรื่อง
   ภาพก่อน-หลัง/การยินยอม ให้ระบุว่าต้องแนบหลักฐานอะไร (เช่น "แนบหนังสือยินยอมเป็นลายลักษณ์อักษรจากเจ้าของภาพ")

ถ้าไม่พบปัญหาใดๆ ให้ status = "passed" และ flags เป็นอาร์เรย์ว่าง

กฎสำคัญที่ห้ามฝ่าฝืนเด็ดขาด: ถ้า status เป็น "caution" หรือ "violation" (คือไม่ใช่ "passed")
flags ต้องมีอย่างน้อย 1 รายการเสมอ ห้ามส่ง status เป็น caution/violation พร้อม flags ว่างเปล่า
ถ้าคุณรู้สึกว่าภาพนี้มีความเสี่ยงแต่ยังไม่แน่ใจว่าจุดไหน ให้เลือกข้อความ/ส่วนของภาพที่ใกล้เคียงที่สุดมาระบุเป็น
quoted_text แทน อย่าปล่อยให้ flags ว่างเปล่าเมื่อ status ไม่ใช่ "passed" โดยเด็ดขาด
`.trim();

const REVIEW_TOOL: Anthropic.Tool = {
  name: "submit_review",
  description: "ส่งผลการตรวจสอบความสอดคล้องของโฆษณากับกฎหมาย/ระเบียบที่เกี่ยวข้อง",
  input_schema: {
    type: "object",
    // `flags` is listed first (and status/confidence last) on purpose: the
    // model tends to generate object fields in the order they're declared
    // in the schema, and flags — with the long detailed_explanation /
    // suggested_correction text — is the part most at risk of being cut off
    // if a response runs long. Put the important, detailed data first so a
    // truncation (if it ever happens again) drops the least useful field.
    properties: {
      flags: {
        type: "array",
        items: {
          type: "object",
          properties: {
            quoted_text: { type: "string" },
            category: { type: "string" },
            legal_ref: { type: "string", description: "เลขมาตรากฎหมายหรือแหล่งอ้างอิงแบบเจาะจง" },
            severity: { type: "string", enum: ["ห้ามเด็ดขาด", "ควรระวัง"] },
            confidence_level: { type: "string", enum: ["สูง", "ปานกลาง", "ต่ำ"] },
            topic: { type: "string", description: "หัวข้อหลักสั้นๆ ไม่เกิน 6-8 คำ" },
            detailed_explanation: {
              type: "string",
              description:
                "คำอธิบายละเอียด 1 ย่อหน้า 3-4 บรรทัด ต้องอ้างอิงมาตรากฎหมายและคำจากคู่มือ สบส./อย. แบบเจาะจง",
            },
            suggested_correction: {
              type: "string",
              description:
                "คำแนะนำวิธีแก้ไขที่ใช้ได้จริง 1 ย่อหน้า 2-4 บรรทัด ระบุเจาะจง (ข้อความที่ควรใช้แทน หรือหลักฐานที่ต้องแนบ)",
            },
          },
          required: [
            "quoted_text",
            "category",
            "legal_ref",
            "severity",
            "confidence_level",
            "topic",
            "detailed_explanation",
            "suggested_correction",
          ],
        },
      },
      confidence: { type: "number", description: "ความมั่นใจโดยรวม 0-100" },
      status: { type: "string", enum: ["passed", "caution", "violation"] },
    },
    required: ["flags", "confidence", "status"],
  },
};

export async function reviewImage(params: {
  base64Image?: string;
  mediaType?: string;
  caption?: string;
  filename: string;
}): Promise<ReviewResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set — add it to .env.local (see README) to enable real AI review."
    );
  }

  const content: Anthropic.MessageParam["content"] = [];
  if (params.base64Image && params.mediaType) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: params.mediaType as any, data: params.base64Image },
    });
  }
  content.push({
    type: "text",
    text: `ไฟล์: ${params.filename}\nคำบรรยายที่จะใช้ในโฆษณา: "${params.caption || "(ไม่มี)"}"\n\nกรุณาตรวจสอบและเรียก submit_review`,
  });

  const message = await client.messages.create({
    model: "claude-sonnet-5",
    // Raised from 1536: each flag now requires topic + a 3-4 line
    // detailed_explanation + a 2-4 line suggested_correction. With the old
    // budget, a response with 2+ flags could hit the token limit mid-way
    // through the `flags` array — the JSON gets cut off, the tool call comes
    // back with `status` already set but `flags` empty (status is written
    // before flags in the schema), and the app's own safety net then shows a
    // generic "AI flagged this but gave no detail" placeholder instead of
    // the real analysis. Confirmed happening in production. Give enough
    // headroom for several fully-detailed flags per image.
    max_tokens: 4096,
    // NOTE: do NOT set `temperature` here. This model rejects it outright
    // ("`temperature` is deprecated for this model" — a 400 error on every
    // single call), which silently failed every review in production and
    // got masked as a false "passed" by the fallback below. Determinism for
    // this model is controlled by the model/API itself, not a client param.
    system: RULES_CONTEXT,
    tools: [REVIEW_TOOL],
    tool_choice: { type: "tool", name: "submit_review" },
    messages: [{ role: "user", content }],
  });

  if (message.stop_reason === "max_tokens") {
    // The response was truncated even at the larger budget — the tool call
    // is likely incomplete/invalid. Surface this distinctly so it isn't
    // confused with a normal empty-flags mismatch in the logs.
    console.error(
      `reviewImage: response for ${params.filename} was truncated at max_tokens — output may be incomplete`
    );
  }

  const toolUse = message.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  if (!toolUse) throw new Error("Claude did not return a structured review");

  return toolUse.input as ReviewResult;
}
