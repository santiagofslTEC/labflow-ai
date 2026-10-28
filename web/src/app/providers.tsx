"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import type * as React from "react";

const newQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { refetchOnWindowFocus: true, retry: 1 },
    },
  });

// One client per browser session, created on first render (never at module
// level, so two requests on the server never share a cache).
function Providers({ children }: { readonly children: React.ReactNode }) {
  const [client] = useState(newQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

export { Providers, newQueryClient };
