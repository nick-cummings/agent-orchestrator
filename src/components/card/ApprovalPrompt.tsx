"use client";

import type { PendingApproval } from "@/lib/db/schema";

/**
 * The tap-to-approve surface shown when the agent loop has parked an
 * `ask`-category tool call. Approving/rejecting resumes the loop server-side.
 */
export const ApprovalPrompt = ({
    pending,
    busy,
    onDecide,
}: {
    pending: PendingApproval;
    busy: boolean;
    onDecide: (decision: "approve" | "reject") => void;
}) => (
    <div className="flex flex-col gap-2 rounded-lg border border-accent bg-card p-3">
        <p className="text-sm text-primary">
            Approve <span className="font-medium">{pending.name}</span>?
        </p>
        <pre className="overflow-x-auto rounded bg-surface p-2 text-xs text-muted">
            {JSON.stringify(pending.input, null, 2)}
        </pre>
        <div className="flex gap-2">
            <button
                type="button"
                disabled={busy}
                onClick={() => {
                    onDecide("approve");
                }}
                className="rounded-md bg-accent px-3 py-1.5 text-sm text-accent-foreground disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            >
                Approve
            </button>
            <button
                type="button"
                disabled={busy}
                onClick={() => {
                    onDecide("reject");
                }}
                className="rounded-md border border-line px-3 py-1.5 text-sm text-primary disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            >
                Reject
            </button>
        </div>
    </div>
);
