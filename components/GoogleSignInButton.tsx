"use client";

import { useFormStatus } from "react-dom";

// Split out from app/login/page.tsx so useFormStatus can see the form's
// pending state — that requires a client component nested inside the
// <form>, it can't live in the (server) page component itself.
//
// Why this exists: without disabling the button while the sign-in is in
// flight, a second click (or a real double-click, easy to do on Render's
// free tier where the first response can take a moment) fires a second
// Auth.js signIn() server action before the first one's redirect lands.
// Each call writes its own PKCE code_verifier cookie under the same name,
// so the second write can race the first and leave a cookie that doesn't
// match the code_challenge Google actually received — surfacing later as
// "PKCE code_verifier cookie was missing" or "Invalid code verifier" on
// the callback. Disabling on first click prevents the second request.
export function GoogleSignInButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className="w-full flex items-center justify-center gap-2 rounded-md border border-border px-4 py-3 text-sm font-medium hover:bg-page disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {pending ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบด้วย Google"}
    </button>
  );
}
