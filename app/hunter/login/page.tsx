import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";

// Hunter freelancer sign-in — a separate route from /login (clinic/
// business) AND from /admin (platform staff), mirroring app/sales/login
// exactly. Same NextAuth Google provider, no second OAuth client needed
// (see claude/Google Login Setup.md). Redirects to /hunter afterward.
// Signing in here does NOT create a business row, even for a brand-new
// email — see lib/currentBusiness.ts's hunter_users guard. What happens to
// the signed-in Google account is decided by /hunter itself, not this
// page: a new email is self-registered as a Hunter on the spot
// (lib/hunterUsers.ts:autoRegisterHunterUser — referral link, self-sourced
// Pipeline and commission tabs work immediately; admin-sent clinic leads
// start after an admin approves them), a deactivated one is refused, and
// an admin/sales staff account is told to use a different Google account
// (app/hunter/page.tsx). The copy below describes that flow — it used to
// claim the page was admin-whitelisted, which stopped being true with the
// self-serve change (see "Hunter Self-Serve Signup Request.md").
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

export default async function HunterLoginPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const errorCode =
    typeof searchParams?.error === "string" ? searchParams.error : undefined;

  // Same intermittent double-callback race /login and /sales/login have —
  // see those pages' own comments and claude/Google Login Setup.md.
  if (errorCode) {
    const session = await auth();
    if (session?.user) {
      redirect("/hunter");
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
        <h1 className="text-xl font-medium mb-2">เข้าสู่ระบบ Hunter</h1>
        <p className="text-sm text-secondary mb-2">
          เข้าสู่ระบบด้วยบัญชี Google เพื่อเริ่มเป็น Hunter ได้ทันที — รับลิงก์ชวนสมัคร เพิ่มคลินิกที่หาเองลง Pipeline
          และติดตามค่าคอมมิชชั่นของคุณ
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
            await signIn("google", { redirectTo: "/hunter" });
          }}
        >
          <GoogleSignInButton />
        </form>
        <p className="text-xs text-tertiary mt-6">
          สมัครครั้งแรกไม่ต้องรออนุมัติ — เฉพาะการรับคลินิกที่แอดมินส่งให้ จะเริ่มหลังแอดมินอนุมัติบัญชีของคุณ
        </p>
      </div>
    </main>
  );
}
