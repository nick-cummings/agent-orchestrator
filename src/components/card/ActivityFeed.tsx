"use client";

import { useState } from "react";

import type { Activity } from "@/lib/db/activities";

/**
 * The Engine activity feed as a collapsed inline element (spec §3.5): a
 * one-line summary of the latest activity, expandable to the full
 * plan/progress/code-change/result list. Read-only; the data comes from the
 * card-session read model + live SSE refresh.
 */

const KIND_LABEL: Partial<Record<string, string>> = {
    plan: "Plan",
    message: "Message",
    code_change: "Code change",
    tool: "Tool",
    progress: "Progress",
    result: "Result",
};

const summarize = (a: Activity): string =>
    a.text ?? KIND_LABEL[a.kind] ?? a.kind;

export const ActivityFeed = ({ activities }: { activities: Activity[] }) => {
    const [expanded, setExpanded] = useState(false);

    if (activities.length === 0) {
        return <p className="text-sm text-muted">No activity yet.</p>;
    }

    const latest = activities[activities.length - 1];

    return (
        <div className="rounded-lg border border-line bg-card">
            <button
                type="button"
                aria-expanded={expanded}
                onClick={() => {
                    setExpanded((v) => !v);
                }}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            >
                <span className="truncate text-primary">
                    <span className="text-muted">Jules:</span>{" "}
                    {summarize(latest)}
                </span>
                <span className="shrink-0 text-xs text-muted">
                    {expanded ? "Hide" : `${String(activities.length)} events`}
                </span>
            </button>

            {expanded && (
                <ul className="border-t border-line">
                    {activities.map((a) => (
                        <li
                            key={a.id}
                            className="flex gap-2 border-b border-line px-3 py-1.5 text-sm last:border-b-0"
                        >
                            <span className="w-24 shrink-0 text-xs text-muted">
                                {KIND_LABEL[a.kind] ?? a.kind}
                            </span>
                            <span className="text-primary">{summarize(a)}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};
