"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

/**
 * App-wide client providers. One QueryClient per browser session (created in
 * state so it survives re-renders but isn't shared across requests on the
 * server). Kept tiny — feature data hooks live with their components.
 */
export const Providers = ({ children }: { children: ReactNode }) => {
    const [client] = useState(
        () =>
            new QueryClient({
                defaultOptions: { queries: { staleTime: 5_000 } },
            }),
    );
    return (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
};
