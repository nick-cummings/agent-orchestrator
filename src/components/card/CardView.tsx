"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ActivityFeed } from "@/components/card/ActivityFeed";
import { StartTaskForm } from "@/components/card/StartTaskForm";
import * as api from "@/lib/api/client";
import type { StartExecutionBody } from "@/lib/api/requests";

/**
 * The card session view: shows the card's latest Execution and its live
 * activity feed, or a StartTaskForm when there's none. Reads the card-session
 * model via React Query and refreshes it on any SSE event (the stream is a
 * "something changed" signal; the read model is the source of truth). Steering
 * and plan-approval post back through the API.
 */

const STATUS: Partial<Record<string, { label: string; className: string }>> = {
    starting: { label: "Starting", className: "text-muted" },
    planning: { label: "Planning", className: "text-accent" },
    awaiting_plan_approval: {
        label: "Awaiting plan approval",
        className: "text-accent",
    },
    running: { label: "Running", className: "text-accent" },
    awaiting_feedback: { label: "Awaiting feedback", className: "text-accent" },
    succeeded: { label: "PR ready", className: "text-success" },
    failed: { label: "Failed", className: "text-danger" },
    cancelled: { label: "Cancelled", className: "text-muted" },
};

const TERMINAL = new Set(["succeeded", "failed", "cancelled"]);

export const CardView = ({ cardId }: { cardId: string }) => {
    const router = useRouter();
    const queryClient = useQueryClient();
    const query = useQuery({
        queryKey: ["card-session", cardId],
        queryFn: () => api.fetchCardSession(cardId),
    });
    const refresh = () =>
        queryClient.invalidateQueries({ queryKey: ["card-session", cardId] });

    const start = useMutation({
        mutationFn: (body: StartExecutionBody) =>
            api.startExecution(cardId, body),
        onSuccess: refresh,
    });
    const steer = useMutation({
        mutationFn: (vars: { id: string; text: string }) =>
            api.sendExecutionMessage(vars.id, vars.text),
        onSuccess: refresh,
    });
    const approve = useMutation({
        mutationFn: (id: string) => api.approveExecutionPlan(id),
        onSuccess: refresh,
    });

    const sessionId = query.data?.session?.id;
    useEffect(() => {
        if (!sessionId) return;
        const source = new EventSource(`/api/sessions/${sessionId}/stream`);
        const onEvent = () => {
            void queryClient.invalidateQueries({
                queryKey: ["card-session", cardId],
            });
        };
        source.addEventListener("activity", onEvent);
        source.addEventListener("state", onEvent);
        return () => {
            source.close();
        };
    }, [sessionId, cardId, queryClient]);

    const [steerText, setSteerText] = useState("");

    if (query.isPending) return <p className="p-6 text-muted">Loading…</p>;
    if (query.isError)
        return <p className="p-6 text-muted">Could not load this card.</p>;

    const current = query.data.executions.at(-1);

    return (
        <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-6">
            <button
                type="button"
                onClick={() => {
                    router.back();
                }}
                className="self-start text-sm text-muted hover:text-primary focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            >
                ← Back
            </button>

            {!current ? (
                <StartTaskForm
                    pending={start.isPending}
                    onStart={(body) => {
                        start.mutate(body);
                    }}
                />
            ) : (
                <section className="flex flex-col gap-4">
                    <header className="flex flex-wrap items-center gap-3">
                        <span
                            className={`text-sm font-medium ${STATUS[current.state]?.className ?? "text-muted"}`}
                        >
                            {STATUS[current.state]?.label ?? current.state}
                        </span>
                        <a
                            href={current.deepLinkUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm text-muted underline hover:text-primary focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                        >
                            Open in Jules ↗
                        </a>
                        {current.resultPrUrl && (
                            <a
                                href={current.resultPrUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sm text-success underline focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                            >
                                View PR ↗
                            </a>
                        )}
                    </header>

                    <p className="text-sm text-muted">{current.prompt}</p>

                    {current.state === "awaiting_plan_approval" && (
                        <button
                            type="button"
                            disabled={approve.isPending}
                            onClick={() => {
                                approve.mutate(current.id);
                            }}
                            className="self-start rounded-md bg-accent px-3 py-1.5 text-sm text-accent-foreground disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                        >
                            Approve plan
                        </button>
                    )}

                    <ActivityFeed activities={current.activities} />

                    {!TERMINAL.has(current.state) && (
                        <form
                            className="flex gap-2"
                            onSubmit={(e) => {
                                e.preventDefault();
                                if (steerText.trim().length === 0) return;
                                steer.mutate({
                                    id: current.id,
                                    text: steerText.trim(),
                                });
                                setSteerText("");
                            }}
                        >
                            <input
                                aria-label="Send guidance"
                                value={steerText}
                                placeholder="Send guidance to Jules…"
                                onChange={(e) => {
                                    setSteerText(e.target.value);
                                }}
                                className="flex-1 rounded-md border border-line bg-card px-2 py-1.5 text-sm text-primary focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                            />
                            <button
                                type="submit"
                                className="rounded-md border border-line px-3 text-sm text-primary hover:border-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                            >
                                Send
                            </button>
                        </form>
                    )}
                </section>
            )}
        </main>
    );
};
