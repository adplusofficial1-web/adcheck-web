import Link from "next/link";

export function Nav({
  credits,
  backHref,
  backLabel = "Dashboard",
}: {
  credits?: number;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <nav className="bg-inverse text-onInverse flex items-center justify-between px-14 py-6">
      <Link href="/" className="flex items-center gap-2">
        <span className="text-base font-medium">ADCheck</span>
      </Link>
      <div className="flex items-center gap-3">
        {typeof credits === "number" && (
          <span className="rounded-pill bg-white/10 border border-onInverse/30 px-4 py-2 text-sm">
            เครดิตคงเหลือ {credits}
          </span>
        )}
        {backHref && (
          <Link
            href={backHref}
            className="rounded-pill border border-onInverse/40 px-4 py-2 text-sm hover:bg-white/10"
          >
            ← {backLabel}
          </Link>
        )}
        <div className="h-8 w-8 rounded-full bg-accentSoft" />
      </div>
    </nav>
  );
}
