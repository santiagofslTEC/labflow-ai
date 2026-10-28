import { AppShell } from "@/components/app-shell/app-shell";
import { isDevUiEnabled } from "@/lib/dev-ui";

import { Providers } from "../providers";

// Every page behind the access gate gets the sidebar shell; /access sits outside it.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Providers>
      <AppShell showDevLinks={isDevUiEnabled(process.env.VERCEL_ENV)}>
        {children}
      </AppShell>
    </Providers>
  );
}
