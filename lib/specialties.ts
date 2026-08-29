// Single source of truth for businesses.specialty's allowed values and
// Thai labels — shared by every place a clinic's specialty is read or
// written: the clinic's own settings (components/settings/SettingsClient.tsx,
// app/api/settings/clinic-info/route.ts) and an agency editing a child
// clinic on its behalf (components/agency/ClinicSettingsCard.tsx,
// app/api/agency/clinics/[id]/route.ts). Keeping one array instead of
// separately-typed-out copies is what keeps the DB CHECK constraint
// (migrations/004_business_specialty.sql, widened in
// 006_expand_business_specialty.sql) and every UI dropdown from drifting
// out of sync with each other.
//
// Only meaningful for type "clinic" — an "agency" account (or, in the
// agency-managed-clinic case, the agency's own row) manages clinics of
// possibly-mixed specialties, so it has none of its own.
export const SPECIALTY_OPTIONS: { value: string; label: string }[] = [
  { value: "beauty", label: "คลินิกความงาม" },
  { value: "dental", label: "ทันตกรรม" },
  { value: "ortho", label: "กระดูกและข้อ" },
  { value: "pharmacy", label: "ร้านขายยา" },
  { value: "vet", label: "สัตวแพทย์" },
  { value: "hospital", label: "โรงพยาบาล" },
  { value: "general", label: "เวชกรรมทั่วไป / อายุรกรรม" },
  { value: "diet", label: "คลินิกลดน้ำหนัก / ควบคุมน้ำหนัก" },
  { value: "dermatology", label: "ผิวหนัง" },
  { value: "eye", label: "จักษุ (ตา)" },
  { value: "ent", label: "หู คอ จมูก" },
  { value: "obgyn", label: "สูตินรีเวช" },
  { value: "pediatrics", label: "กุมารเวช" },
  { value: "fertility", label: "ผู้มีบุตรยาก" },
  { value: "physical_therapy", label: "กายภาพบำบัด" },
  { value: "traditional_medicine", label: "แพทย์แผนไทย / แผนจีน" },
  { value: "rehab", label: "เวชศาสตร์ฟื้นฟู" },
  { value: "mental_health", label: "จิตเวช" },
  { value: "other", label: "อื่น ๆ" },
];

export const VALID_SPECIALTIES: string[] = SPECIALTY_OPTIONS.map((o) => o.value);

export const SPECIALTY_LABEL: Record<string, string> = Object.fromEntries(
  SPECIALTY_OPTIONS.map((o) => [o.value, o.label])
);
