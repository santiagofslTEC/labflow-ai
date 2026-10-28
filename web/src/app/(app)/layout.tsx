import { AppShell } from "@/components/app-shell/app-shell";

import { Providers } from "../providers";

// Every page behind the access gate gets the sidebar shell; /access sits outside it.
// The dev pages (/dev/ui, /dev/capture) stay reachable by URL but are not linked
// from the sidebar, so testers only see the real app.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Providers>
      <AppShell showDevLinks={false}>{children}</AppShell>
    </Providers>
  );
}
