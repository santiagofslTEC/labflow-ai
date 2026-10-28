"use client";

import {
  FlaskConicalIcon,
  HouseIcon,
  LayoutPanelLeftIcon,
  PaletteIcon,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

import { BrandMark } from "./brand-mark";

type NavLink = {
  readonly href: string;
  readonly label: string;
  readonly icon: LucideIcon;
};

const MAIN_LINKS: readonly NavLink[] = [
  { href: "/", label: "Inicio", icon: HouseIcon },
];

// Only outside production, like /dev/ui itself (AC-16).
const DEV_LINKS: readonly NavLink[] = [
  { href: "/dev/ui", label: "Sistema de diseño", icon: PaletteIcon },
  {
    href: "/dev/ui/workspace",
    label: "Espacio de ejemplo",
    icon: LayoutPanelLeftIcon,
  },
];

type SidebarProps = {
  readonly showDevLinks: boolean;
  readonly onNavigate?: () => void;
};

// The app's left rail (Linear, Notion): wordmark, main links, the experiments
// list, and the dev pages when they exist.
function Sidebar({ showDevLinks, onNavigate }: SidebarProps) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col gap-6 px-3 pb-4">
      <div className="flex h-14 items-center px-2">
        <BrandMark />
      </div>

      <nav aria-label="Principal" className="flex flex-col gap-6">
        <NavList
          links={MAIN_LINKS}
          pathname={pathname}
          onNavigate={onNavigate}
        />

        <section aria-labelledby="sidebar-experimentos">
          <h2
            id="sidebar-experimentos"
            className="px-2 pb-1 text-xs font-medium text-ink-muted"
          >
            Experimentos
          </h2>
          <p className="flex items-center gap-2 px-2 py-2 text-sm text-ink-muted">
            <FlaskConicalIcon aria-hidden className="size-4 shrink-0" />
            Aún no hay experimentos
          </p>
        </section>

        {showDevLinks ? (
          <section aria-labelledby="sidebar-desarrollo">
            <h2
              id="sidebar-desarrollo"
              className="px-2 pb-1 text-xs font-medium text-ink-muted"
            >
              Desarrollo
            </h2>
            <NavList
              links={DEV_LINKS}
              pathname={pathname}
              onNavigate={onNavigate}
            />
          </section>
        ) : null}
      </nav>
    </div>
  );
}

function NavList({
  links,
  pathname,
  onNavigate,
}: {
  readonly links: readonly NavLink[];
  readonly pathname: string;
  readonly onNavigate: (() => void) | undefined;
}) {
  return (
    <ul className="flex flex-col gap-0.5">
      {links.map(({ href, label, icon: Icon }) => {
        const current = pathname === href;
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={current ? "page" : undefined}
              onClick={onNavigate}
              className={cn(
                "flex h-10 items-center gap-2.5 rounded-control px-2 text-sm focus-ring transition-colors",
                current
                  ? "bg-sunken font-medium text-ink"
                  : "text-ink-muted hover:bg-sunken hover:text-ink",
              )}
            >
              <Icon aria-hidden className="size-4 shrink-0" />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export { Sidebar };
