import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signIn, signOut } from "@/auth";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { getCurrentBusiness } from "@/lib/currentBusiness";
import { getCurrentHunterUser } from "@/lib/currentHunterUser";
import { getCurrentSalesUser } from "@/lib/currentSalesUser";

// Bug Audit 4 (2569-09-02): where a signed-in visitor should land after
// sign-in. Only a same-origin path is honoured — an absolute URL or a
// protocol-relative `//evil.example` in ?callbackUrl= would otherwise turn
// this page into an open redirect.
function safeCallbackUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return null;
  return raw;
}

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
  // app/admin/layout.tsx (via middleware's x-pathname) and other protected
  // pages send people here with ?callbackUrl=<the page they wanted>. Bug
  // Audit 4 (2569-09-02): this page used to ignore it and always send
  // everyone to /dashboard after Google sign-in, which silently undid the
  // audit-2 fix that made the admin redirect carry the real path.
  const callbackUrl = safeCallbackUrl(searchParams?.callbackUrl) ?? "/dashboard";

  // Already signed in? Send the visitor to the right home instead of
  // showing the Google button again (or, worse, looping).
  //
  // The login flow intermittently races two callback requests to Google
  // (root cause not yet fixed — see Google Login Setup doc), so the request
  // that "loses" can land here with an error even after the other one
  // already succeeded and set a valid session cookie — that case is covered
  // by the same check.
  //
  // Bug Audit 4 (2569-09-02): every clinic page does `if (!business)
  // redirect("/login")`, and lib/currentBusiness.ts deliberately returns
  // null for Hunter/Sales Google accounts (they must never become a
  // customer business). Before this block a Hunter or Sales rep who opened
  // /dashboard bounced /dashboard → /login → /dashboard → … forever with no
  // message. Now they're routed to their own area, and an account that is
  // blocked from everything gets a plain explanation + sign-out instead of
  // a loop.
  const session = await auth();
  let blockedAccountEmail: string | null = null;
  if (session?.user?.email) {
    const business = await getCurrentBusiness();
    if (business) redirect(callbackUrl);
    if (await getCurrentHunterUser()) redirect("/hunter");
    if (await getCurrentSalesUser()) redirect("/sales");
    blockedAccountEmail = session.user.email;
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
        {blockedAccountEmail ? (
          <div className="text-sm text-secondary">
            <p className="mb-4">
              บัญชี {blockedAccountEmail} เข้าสู่ระบบแล้ว แต่ยังใช้งานส่วนของคลินิกไม่ได้ในขณะนี้ —
              ติดต่อทีม AD Plus หากคิดว่านี่เป็นความผิดพลาด หรือออกจากระบบแล้วเข้าด้วยบัญชี Google อื่น
            </p>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <button type="submit" className="rounded-md border border-border px-4 py-2 text-sm text-primary">
                ออกจากระบบ
              </button>
            </form>
          </div>
        ) : (
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: callbackUrl });
            }}
          >
            <GoogleSignInButton />
          </form>
        )}
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
