import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderResult } from "@testing-library/react";
import type { ReactElement } from "react";

/**
 * Render a component inside a fresh QueryClient with retries off, so failed
 * queries surface immediately in tests instead of being retried on a timer.
 */
export const renderWithClient = (ui: ReactElement): RenderResult => {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    return render(
        <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
    );
};
