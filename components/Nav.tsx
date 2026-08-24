"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// href: null means the page for that section doesn't exist yet — the item
// shows in the menu (per the requested layout) but isn't clickable, so it
// never points people at a 404. Flip it to a real path once that page is
// built, and it'll automatically become a normal link.
const MENU_ITEMS: { href: string | null; label: string }[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: null, label: "บทความ" },
  { href: null, label: "เกี่ยวกับ" },
  { href: "/history", label: "ประวัติ" },
  { href: "/pricing", label: "ราคาแพ็กเกจ" },
  { href: "/settings", label: "ตั้งค่า" },
];

/**
 * Shared top nav for every logged-in app page (dashboard, history, pricing,
 * settings, upload, checkout, results, processing — anywhere a person is
 * already inside the product). The public marketing page (app/page.tsx,
 * logged-out) and the printable PDF report (app/results/[id]/pdf) each have
 * their own header instead and don't use this component.
 *
 * "use client" + usePathname so the current section can be highlighted —
 * every page that renders this already runs fine with a client child.
 */
export function Nav({ credits }: { credits?: number }) {
  const pathname = usePathname();

  function MenuLink({
    item,
    className,
  }: {
    item: (typeof MENU_ITEMS)[number];
    className: (active: boolean) => string;
  }) {
    if (!item.href) {
      // Not a page yet — plain label, not clickable, not focusable.
      return <span className={className(false) + " cursor-default"}>{item.label}</span>;
    }
    const active = pathname === item.href || pathname?.startsWith(item.href + "/");
    return (
      <Link href={item.href} aria-current={active ? "page" : undefined} className={className(active)}>
        {item.label}
      </Link>
    );
  }

  return (
    <nav className="bg-inverse text-onInverse px-6 md:px-14 py-5">
      <div className="flex items-center justify-between gap-6">
        <div className="flex items-center gap-10 min-w-0">
          <Link href="/" className="text-base font-medium shrink-0">
            ADCheck
          </Link>
          <div className="hidden md:flex items-center gap-6 text-sm">
            {MENU_ITEMS.map((item) => (
              <MenuLink
                key={item.label}
                item={item}
                className={(active) =>
                  `whitespace-nowrap transition-colors ${
                    active ? "text-onInverse font-medium" : "text-onInverse/70 hover:text-onInverse"
                  }`
                }
              />
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <Link
            href="/upload"
            className="rounded-md bg-white text-inverse px-4 py-2 text-sm font-medium whitespace-nowrap hover:bg-white/90"
          >
            + อัปโหลด
          </Link>
          {typeof credits === "number" && (
            <Link
              href="/checkout"
              className="rounded-pill bg-white/10 border border-onInverse/30 px-4 py-2 text-sm whitespace-nowrap hover:bg-white/20"
            >
              เครดิตคงเหลือ {credits}
            </Link>
          )}
          <div className="h-8 w-8 rounded-full bg-accentSoft shrink-0" />
        </div>
      </div>

      {/* Small-screen menu: same items, wraps under the header row instead
          of being hidden, since there's no separate mobile nav component. */}
      <div className="flex md:hidden flex-wrap gap-x-5 gap-y-2 text-sm mt-4">
        {MENU_ITEMS.map((item) => (
          <MenuLink
            key={item.label}
            item={item}
            className={(active) => (active ? "text-onInverse font-medium" : "text-onInverse/70")}
          />
        ))}
      </div>
    </nav>
  );
}
