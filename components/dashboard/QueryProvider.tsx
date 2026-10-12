"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Cache for 2 min so navigating back to a page doesn't refetch.
            staleTime: 2 * 60_000,
            // No blanket background polling — it hammered every query every
            // 5 min for data that barely changes. Surfaces that need fresh
            // data set their own refetchInterval.
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
