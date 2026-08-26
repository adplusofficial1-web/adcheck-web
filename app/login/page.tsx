import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";

// Auth.js error codes passed via ?error=... when pages.error redirects here
// (see auth.ts). Only a few are realistic for a Google-only OAuth setup;
// everything else falls back to a generic Thai retry message. This turns
// Auth.js's default unstyled crash page into a friendly inline message with
// a clear next action instead.
const ERROR_MESSAGES: Record<string, string> = {
  OAuthCallback:
    "เกิดข้อผิดพลาดชั่วคราวระหว่างเชื่อมต่อกับ Google กรุณาลองเข้าสู่ระบบอีกครั้ง",
  OAuthSignin:
    "ไม่สามารถเริ่มการเข้าสู่ระบบด้วย Google ได้ กรุณาลองใหม่อีกครั้ง",
  AccessDenied: "คุณยกเลิกการเข้าสู่ระบบ หรือไม่ได้อนุญาตสิทธิ์ที่จำเป็น",
  Configuration: "ระบบเข้าสู่ระบบมีปัญหาการตั้งค่า กรุณาติดต่อผู้ดูแลระบบ",
};

const DEFAULT_ERROR_MESSAGE =
  "เข้าสู่ระบบไม่สำเร็จ กรุณาลองอีกครั้ง หากยังไม่สำเร็จ ลองรีเฟรชหน้านี้ก่อนกดเข้าสู่ระบบใหม่";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const errorCode =
    typeof searchParams?.error === "string" ? searchParams.error : undefined;

  // The login flow intermittently races two callback requests to Google
  // (root cause not yet fixed — see Google Login Setup doc), so the request
  // that "loses" can land here with an error even after the other one
  // already succeeded and set a valid session cookie. Rather than show a
  // scary error page to someone who is, from the session's point of view,
  // already logged in, check first and just send them on to the dashboard.
  if (errorCode) {
    const session = await auth();
    if (session?.user) {
      redirect("/dashboard");
    }
  }

  const errorMessage = errorCode
    ? ERROR_MESSAGES[errorCode] ?? DEFAULT_ERROR_MESSAGE
    : undefined;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6">
      <Link
        href="/"
        className="inline-block bg-black text-white text-[32px] font-medium px-6 py-3 rounded-lg mb-10"
      >
        ADCheck
      </Link>
      <div className="w-full max-w-sm border border-border rounded-lg p-8 text-center">
        <h1 className="text-xl font-medium mb-2">เข้าสู่ระบบ</h1>
        <p className="text-sm text-secondary mb-8">
          เข้าสู่ระบบด้วยบัญชี Google เพื่อจัดการการตรวจสอบโฆษณาของคุณ
        </p>
        {errorMessage && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-6">
            {errorMessage}
          </p>
        )}
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/dashboard" });
          }}
        >
          <GoogleSignInButton />
        </form>
      </div>
    </main>
  );
}
