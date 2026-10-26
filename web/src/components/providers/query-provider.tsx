"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState, type ReactNode } from "react";

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => {
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          // No global freshness window: public pages always revalidate on
          // mount. Their data moves out of band (downloads via API keys,
          // admin edits in another tab), and stale counters or ordering are
          // exactly what users notice.
          retry: 1,
          refetchOnWindowFocus: false,
        },
      },
    });
    // The admin console is the only consumer allowed to serve 30s-fresh
    // cache: its data changes exclusively through its own mutations, and
    // those invalidate precisely (queryKeys.admin.*).
    client.setQueryDefaults(["admin"], { staleTime: 30_000 });
    return client;
  });

  return (
    <QueryClientProvider client={client}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
