import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type * as React from "react";

// A fresh cache per test, retrying at once so error states show without waiting.
export const testQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retryDelay: 0, refetchOnWindowFocus: false },
    },
  });

export function renderWithQuery(
  ui: React.ReactElement,
  client: QueryClient = testQueryClient(),
) {
  return {
    client,
    ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>),
  };
}
