// Single source of truth for "how many images can go into one submission" —
// referenced by every place that either enforces or merely displays this
// number (the upload form's slot-counting/disabled-state logic, the
// marketing copy on the homepage and upload pages, and the API route's
// server-side guard) so raising or lowering the limit is a one-line change
// instead of a find-and-replace across the app.
export const MAX_UPLOAD_IMAGES = 10;
