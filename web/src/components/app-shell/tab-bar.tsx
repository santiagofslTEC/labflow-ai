"use client";

import {
  HouseIcon,
  LibraryIcon,
  PlusIcon,
  SettingsIcon,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

import { cn } from "@/lib/utils";

type Tab = {
  readonly href: string;
  readonly label: string;
  readonly icon: LucideIcon;
};

const TABS: readonly Tab[] = [
  { href: "/", label: "Inicio", icon: HouseIcon },
  { href: "/cuadernos", label: "Cuadernos", icon: LibraryIcon },
  { href: "/cuadernos/nuevo", label: "Nuevo", icon: PlusIcon },
  { href: "/configuracion", label: "Ajustes", icon: SettingsIcon },
];

// The tab a page belongs to: a notebook and its results sit under Cuadernos,
// except the create page, which is Nuevo.
export const currentTab = (pathname: string): string | null => {
  if (pathname === "/") return "/";
  if (pathname === "/cuadernos/nuevo") return "/cuadernos/nuevo";
  if (pathname === "/cuadernos" || pathname.startsWith("/cuadernos/"))
    return "/cuadernos";
  if (pathname.startsWith("/configuracion")) return "/configuracion";
  return null;
};

// The phone's bottom tab bar (spec 0010, AC-1): replaces the sidebar below
// 1024px. Its height is --tabbar-height (globals.css), which the content and
// the dock reserve. The path is runtime data, so it streams in under Suspense
// with the bar drawn unmarked meanwhile.
function TabBar() {
  return (
    <Suspense fallback={<TabBarView current={null} />}>
      <CurrentTabBar />
    </Suspense>
  );
}

function CurrentTabBar() {
  return <TabBarView current={currentTab(usePathname())} />;
}

function TabBarView({ current }: { readonly current: string | null }) {
  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-canvas/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
    >
      <ul className="mx-auto grid h-16 max-w-xl grid-cols-4">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = current === href;
          return (
            <li key={href} className="flex">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-1 flex-col items-center justify-center gap-1 rounded-control text-xs font-medium focus-ring transition-colors",
                  active ? "text-ink" : "text-ink-muted hover:text-ink",
                )}
              >
                <Icon
                  aria-hidden
                  className="size-5"
                  strokeWidth={active ? 2.25 : 1.75}
                />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export { TabBar };
