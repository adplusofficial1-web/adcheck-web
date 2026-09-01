import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
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

  // Sales Commission (2026-09-01): a sales rep's referral link is
  // /login?ref=<sales_user_id> (see components/admin/SalesOverview.tsx /
  // app/sales/page.tsx for where that link is copied from). Stashed in a
  // short-lived cookie here, at the point of clicking "sign in", rather than
  // trying to carry it through the Google OAuth round trip itself — read
  // back once, at the moment a business row is actually created, by
  // lib/currentBusiness.ts. Deliberately NOT validated against sales_users
  // here — that check happens once, where it matters (currentBusiness.ts),
  // so this page doesn't need DB access at all.
  const ref = typeof searchParams?.ref === "string" ? searchParams.ref : undefined;

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
        className="w-full max-w-sm bg-black text-white text-[32px] font-medium px-6 py-3 rounded-lg mb-10 text-center"
      >
        ADCheck
      </Link>
      <div className="w-full max-w-sm border border-border rounded-lg p-8 text-center">
        <h1 className="text-xl font-medium mb-2">เข้าสู่ระบบ</h1>
        <p className="text-sm text-secondary mb-2">
          เข้าสู่ระบบด้วยบัญชี Google เพื่อจัดการการตรวจสอบโฆษณาของคุณ
        </p>
        <p className="text-xs text-tertiary mb-8">
          ใช้บัญชี Google ที่คุณมีอยู่แล้ว ไม่ต้องตั้งรหัสผ่านใหม่ ไม่มีการเก็บรหัสผ่านของคุณไว้ในระบบ
        </p>
        {errorMessage && (
          <p className="text-sm text-danger bg-dangerSoft border border-dangerSoft rounded-md px-3 py-2 mb-6">
            {errorMessage}
          </p>
        )}
        <form
          action={async () => {
            "use server";
            if (ref) {
              // 1 hour is plenty for a normal Google OAuth round trip while
              // keeping a stale/reused referral link from attributing a
              // signup that happens days later.
              cookies().set("sales_ref", ref, {
                httpOnly: true,
                maxAge: 60 * 60,
                path: "/",
                sameSite: "lax",
              });
            }
            await signIn("google", { redirectTo: "/dashboard" });
          }}
        >
          <GoogleSignInButton />
        </form>
        <p className="text-xs text-tertiary mt-6">
          ยังไม่เคยใช้งาน?{" "}
          <Link href="/case-studies" className="underline">
            ดูตัวอย่างการตรวจสอบก่อนเริ่มใช้งาน
          </Link>
        </p>
      </div>
    </main>
  );
}
