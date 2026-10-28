"use client";

import {
  BookOpenIcon,
  HouseIcon,
  LayoutPanelLeftIcon,
  LibraryIcon,
  MicIcon,
  PaletteIcon,
  PlusIcon,
  SettingsIcon,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useExperiments } from "@/hooks/use-experiments";
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

const FOOTER_LINKS: readonly NavLink[] = [
  { href: "/configuracion", label: "Configuración", icon: SettingsIcon },
];

// Only outside production, like /dev/ui itself (AC-16).
const DEV_LINKS: readonly NavLink[] = [
  { href: "/dev/ui/home", label: "Inicio por voz", icon: MicIcon },
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

type Location = {
  readonly pathname: string;
  // The notebook open on /cuadernos/{id}, if any.
  readonly openId: string | undefined;
};

// The URL is request data: with cacheComponents the prerendered shell shows
// the same nav with nothing highlighted, and the current page lights up once
// the path is known.
const NO_LOCATION: Location = { pathname: "", openId: undefined };

// The app's left rail (Linear, Notion): wordmark, the new notebook button,
// main links, the notebooks list, and the dev pages when they exist.
function Sidebar(props: SidebarProps) {
  return (
    <div className="flex h-full flex-col gap-5 px-3 pb-4">
      <div className="flex flex-col gap-3">
        <div className="flex h-14 items-center px-1">
          <BrandMark />
        </div>
        <Button asChild variant="secondary" className="justify-start px-3">
          <Link href="/cuadernos/nuevo" onClick={props.onNavigate}>
            <PlusIcon aria-hidden />
            Nuevo cuaderno
          </Link>
        </Button>
      </div>
      <Suspense fallback={<SidebarNav {...props} location={NO_LOCATION} />}>
        <SidebarNavHere {...props} />
      </Suspense>
    </div>
  );
}

function SidebarNavHere(props: SidebarProps) {
  const pathname = usePathname();
  const params = useParams<{ id?: string }>();
  const openId = pathname.startsWith("/cuadernos/") ? params?.id : undefined;
  return <SidebarNav {...props} location={{ pathname, openId }} />;
}

function SidebarNav({
  showDevLinks,
  onNavigate,
  location,
}: SidebarProps & { readonly location: Location }) {
  const { pathname } = location;

  return (
    <nav aria-label="Principal" className="flex flex-1 flex-col gap-6">
      <NavList links={MAIN_LINKS} pathname={pathname} onNavigate={onNavigate} />

      <SidebarNotebooks location={location} onNavigate={onNavigate} />

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

      <div className="mt-auto border-t border-line pt-3">
        <NavList
          links={FOOTER_LINKS}
          pathname={pathname}
          onNavigate={onNavigate}
        />
      </div>
    </nav>
  );
}

const SIDEBAR_LIMIT = 5;

const linkClass = (current: boolean) =>
  cn(
    "flex h-10 items-center gap-2.5 rounded-control px-2 text-sm focus-ring transition-colors",
    current
      ? "bg-brand-soft font-medium text-brand"
      : "text-ink hover:bg-sunken",
  );

// The 5 notebooks with the newest activity, from the same cached list as
// /cuadernos (spec 0005, AC-12). The open notebook is highlighted when listed.
function SidebarNotebooks({
  location: { pathname, openId },
  onNavigate,
}: {
  readonly location: Location;
  readonly onNavigate: (() => void) | undefined;
}) {
  const query = useExperiments();
  const notebooks = query.data;

  return (
    <section aria-labelledby="sidebar-cuadernos" className="flex flex-col">
      <h2
        id="sidebar-cuadernos"
        className="px-2 pb-1 text-xs font-medium text-ink-muted"
      >
        Cuadernos
      </h2>

      {notebooks === undefined && !query.isError ? (
        <div aria-busy className="flex flex-col gap-3 px-2 py-2">
          <span className="sr-only">Cargando cuadernos…</span>
          <Skeleton data-testid="sidebar-skeleton" className="h-4 w-4/5" />
          <Skeleton data-testid="sidebar-skeleton" className="h-4 w-3/5" />
        </div>
      ) : null}

      {notebooks?.length === 0 ? (
        <div className="flex flex-col">
          <p className="flex items-center gap-2 px-2 py-2 text-sm text-ink-muted">
            <BookOpenIcon aria-hidden className="size-4 shrink-0" />
            Aún no hay cuadernos
          </p>
          <Link
            href="/cuadernos/nuevo"
            onClick={onNavigate}
            className={linkClass(pathname === "/cuadernos/nuevo")}
          >
            <PlusIcon aria-hidden className="size-4 shrink-0" />
            Nuevo cuaderno
          </Link>
        </div>
      ) : null}

      {notebooks !== undefined && notebooks.length > 0 ? (
        <ul className="flex flex-col gap-0.5">
          {notebooks.slice(0, SIDEBAR_LIMIT).map((notebook) => {
            const current = String(notebook.id) === openId;
            return (
              <li key={notebook.id}>
                <Link
                  href={`/cuadernos/${notebook.id}`}
                  aria-current={current ? "page" : undefined}
                  onClick={onNavigate}
                  className={linkClass(current)}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "mx-[5px] size-1.5 shrink-0 rounded-full",
                      current ? "bg-brand" : "bg-control/50",
                    )}
                  />
                  <span className="truncate">{notebook.title}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}

      <Link
        href="/cuadernos"
        aria-current={pathname === "/cuadernos" ? "page" : undefined}
        onClick={onNavigate}
        className={linkClass(pathname === "/cuadernos")}
      >
        <LibraryIcon aria-hidden className="size-4 shrink-0" />
        Ver todos
      </Link>
    </section>
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
              className={linkClass(current)}
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
