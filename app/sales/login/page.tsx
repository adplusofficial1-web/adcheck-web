import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";

// Sales rep sign-in — a separate route from /login (the clinic/business
// sign-in) so the two audiences never mix, even though both use the exact
// same NextAuth Google provider/OAuth client (no second OAuth client
// needed — see claude/Google Login Setup.md). The only real difference
// from /login: this redirects to /sales afterward instead of /dashboard.
// Signing in here does NOT create a business row, even for a brand-new
// email — see lib/currentBusiness.ts's sales_users guard. Whether the
// signed-in Google account is actually an authorized, active sales rep is
// decided by /sales itself (lib/currentSalesUser.ts), not this page — an
// unauthorized email can still complete Google sign-in, it just sees
// "ยังไม่ได้รับสิทธิ์" on the next page instead of the lead list.
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

export default async function SalesLoginPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const errorCode =
    typeof searchParams?.error === "string" ? searchParams.error : undefined;

  // Same intermittent double-callback race /login has (see that page's own
  // comment, and claude/Google Login Setup.md) — not a new bug introduced
  // here, both routes share the one NextAuth flow. If this request "lost"
  // the race but a session already exists, move on to /sales rather than
  // showing a scary error to someone who is, from the session's point of
  // view, already signed in.
  if (errorCode) {
    const session = await auth();
    if (session?.user) {
      redirect("/sales");
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
        <h1 className="text-xl font-medium mb-2">เข้าสู่ระบบเซลล์</h1>
        <p className="text-sm text-secondary mb-2">
          เข้าสู่ระบบด้วยบัญชี Google ที่แอดมินลงทะเบียนไว้ให้ เพื่อดูรายชื่อ Lead ของคุณ
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
            await signIn("google", { redirectTo: "/sales" });
          }}
        >
          <GoogleSignInButton />
        </form>
        <p className="text-xs text-tertiary mt-6">
          ยังไม่ได้รับสิทธิ์เข้าใช้งาน? ติดต่อแอดมินเพื่อขอเพิ่มชื่อในระบบ
        </p>
      </div>
    </main>
  );
}
