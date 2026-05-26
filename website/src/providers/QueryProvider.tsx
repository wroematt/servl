'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,      // data is fresh for 30 s — no re-fetch during that window
            retry: 1,               // only retry once on failure (avoids hammering on 429)
            refetchOnWindowFocus: false, // don't re-fetch every time the user alt-tabs back
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
