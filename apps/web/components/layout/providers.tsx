"use client";

import { SessionProvider } from "next-auth/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import type { Session } from "next-auth";
import { LightboxProvider } from "@/components/image-lightbox";

interface ProvidersProps {
  children: React.ReactNode;
  session?: Session | null;
}

export function Providers({ children, session }: ProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            retry: (failureCount, error: any) => {
              if (error?.status === 401 || error?.status === 403) return false;
              return failureCount < 2;
            },
          },
        },
      }),
  );

  return (
    <SessionProvider session={session}>
      <QueryClientProvider client={queryClient}>
        <LightboxProvider>{children}</LightboxProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
