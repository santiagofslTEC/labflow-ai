"use client";

import { ChevronLeftIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

import { BrandMark } from "./brand-mark";

type Back = { readonly href: string; readonly label: string };

// Where the phone's back arrow goes (spec 0010, AC-1): a notebook's results go
// back to it, a notebook goes back to Cuadernos, a class folder to Inicio.
// Nuevo is a tab of its own.
export const backFor = (pathname: string): Back | null => {
  const results = /^\/cuadernos\/([^/]+)\/resultados\/?$/.exec(pathname);
  if (results)
    return { href: `/cuadernos/${results[1]}`, label: "Volver al cuaderno" };
  if (
    /^\/cuadernos\/[^/]+\/?$/.test(pathname) &&
    !pathname.startsWith("/cuadernos/nuevo")
  )
    return { href: "/cuadernos", label: "Volver a Cuadernos" };
  if (/^\/carpetas\/[^/]+\/?$/.test(pathname))
    return { href: "/", label: "Volver al inicio" };
  return null;
};

// The phone's top bar: the brand mark, and a back arrow below a notebook. In
// standalone mode it clears the notch (AC-10). The arrow streams in under
// Suspense, since the path is runtime data.
function TopBar() {
  return (
    <Suspense fallback={<TopBarView back={null} />}>
      <CurrentTopBar />
    </Suspense>
  );
}

function CurrentTopBar() {
  return <TopBarView back={backFor(usePathname())} />;
}

function TopBarView({ back }: { readonly back: Back | null }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 pt-[env(safe-area-inset-top)] backdrop-blur-md lg:hidden">
      <div className="flex h-14 items-center gap-1 px-2">
        {back ? (
          <Link
            href={back.href}
            aria-label={back.label}
            className="inline-flex size-11 items-center justify-center rounded-control text-ink focus-ring transition-colors hover:bg-sunken"
          >
            <ChevronLeftIcon aria-hidden className="size-5" />
          </Link>
        ) : null}
        <BrandMark />
      </div>
    </header>
  );
}

export { TopBar };
