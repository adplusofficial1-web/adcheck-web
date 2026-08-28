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
