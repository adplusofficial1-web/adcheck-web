// Single source of truth for "how many images can go into one submission" —
// referenced by every place that either enforces or merely displays this
// number (the upload form's slot-counting/disabled-state logic, the
// marketing copy on the homepage and upload pages, and the API route's
// server-side guard) so raising or lowering the limit is a one-line change
// instead of a find-and-replace across the app.
export const MAX_UPLOAD_IMAGES = 10;

// FIX (bug audit #12): the upload page's own copy ("รองรับ JPG, PNG, PDF
// ไม่เกิน 10MB ต่อไฟล์") was never actually enforced server-side — only the
// browser-side resize step in app/upload/UploadForm.tsx kept files small in
// practice. A request sent directly to the API (skipping the UI entirely)
// could attach a file of any size or type; images are stored inline as a
// base64 data URL (see the TEMPORARY comment in
// app/api/submissions/route.ts), so an oversized upload bloats the
// database directly, and a non-image mediaType still burns a credit on an
// AI call that can't meaningfully review it.
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB, matches the upload page's own copy
export const ALLOWED_MEDIA_TYPES = ["image/jpeg", "image/png", "application/pdf"];

// FIX (bug audit round 2 #8): the clinic/agency avatar-photo upload
// (app/api/settings/profile/route.ts, app/api/agency/clinics/[id]/route.ts)
// only ever checked that the value started with "data:" — no size or type
// check at all, unlike submission images above. A profile photo has no
// reason to be a multi-page PDF or a multi-hundred-MB original camera
// photo, so this gets its own, smaller allowance rather than reusing
// ALLOWED_MEDIA_TYPES (which intentionally includes application/pdf for
// submission images — meaningless for an avatar).
export const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
export const ALLOWED_AVATAR_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"];

// Validates a client-supplied `data:<mime>;base64,<data>` URL against the
// avatar limits above. Returns an error message (Thai, ready to show the
// user) if invalid, or null if it's fine to store. Estimating the decoded
// byte size from the base64 string's length (rather than actually
// decoding it) avoids allocating a full Buffer just to reject an
// oversized upload.
export function validateAvatarDataUrl(dataUrl: string): string | null {
  const match = /^data:([^;,]+);base64,([\s\S]*)$/.exec(dataUrl);
  if (!match) return "ไฟล์รูปภาพไม่ถูกต้อง";
  const [, mediaType, base64] = match;
  if (!ALLOWED_AVATAR_MEDIA_TYPES.includes(mediaType)) {
    return "รองรับเฉพาะไฟล์รูปภาพ JPG, PNG, WEBP เท่านั้น";
  }
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  const approxBytes = (base64.length * 3) / 4 - padding;
  if (approxBytes > MAX_AVATAR_SIZE_BYTES) {
    return "ไฟล์รูปภาพมีขนาดใหญ่เกินไป (ไม่เกิน 5MB)";
  }
  return null;
}
