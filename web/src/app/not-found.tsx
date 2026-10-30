import { CompassIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function NotFound() {
  return (
    // Renders outside the app shell (root layout only), so it fills the window itself.
    <main className="flex min-h-svh items-center justify-center bg-canvas px-4 py-12">
      <EmptyState
        icon={CompassIcon}
        title="No encontramos esta página"
        description="Puede que el enlace esté mal o que la página ya no exista."
        headingLevel="h1"
        className="w-full max-w-lg bg-surface"
        action={
          <Button asChild variant="secondary">
            <Link href="/">Volver al inicio</Link>
          </Button>
        }
      />
    </main>
  );
}
