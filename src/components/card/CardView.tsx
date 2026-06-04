"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ActivityFeed } from "@/components/card/ActivityFeed";
import { ApprovalPrompt } from "@/components/card/ApprovalPrompt";
import { Chat } from "@/components/card/Chat";
import * as api from "@/lib/api/client";

/**
 * The card session view: a Claude conversation that drives Jules. Reads the
 * card-session model via React Query; the open SSE stream appends live `text`
 * deltas as a streaming bubble and refetches the read model on every persisted
 * `message`/state event (the model is the source of truth). The latest
 * execution's status + activity feed render below the chat.
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

export const CardView = ({ cardId }: { cardId: string }) => {
    const router = useRouter();
    const queryClient = useQueryClient();
    const query = useQuery({
        queryKey: ["card-session", cardId],
        queryFn: () => api.fetchCardSession(cardId),
    });
    const [streamingText, setStreamingText] = useState("");

    const send = useMutation({
        mutationFn: (text: string) => api.sendChatMessage(cardId, text),
        onSettled: () =>
            queryClient.invalidateQueries({
                queryKey: ["card-session", cardId],
            }),
    });
    const decide = useMutation({
        mutationFn: (vars: {
            sessionId: string;
            decision: "approve" | "reject";
        }) => api.respondToApproval(vars.sessionId, vars.decision),
        onSettled: () =>
            queryClient.invalidateQueries({
                queryKey: ["card-session", cardId],
            }),
    });

    const sessionId = query.data?.session?.id;
    useEffect(() => {
        if (!sessionId) return;
        const source = new EventSource(`/api/sessions/${sessionId}/stream`);
        const refetch = () => {
            void queryClient.invalidateQueries({
                queryKey: ["card-session", cardId],
            });
        };
        const onText = (event: Event) => {
            const data = JSON.parse((event as MessageEvent<string>).data) as {
                text: string;
            };
            setStreamingText((prev) => prev + data.text);
        };
        const onSettled = () => {
            setStreamingText("");
            refetch();
        };
        source.addEventListener("text", onText);
        source.addEventListener("message", onSettled);
        source.addEventListener("turn_end", onSettled);
        source.addEventListener("approval_request", refetch);
        source.addEventListener("activity", refetch);
        source.addEventListener("state", refetch);
        return () => {
            source.close();
        };
    }, [sessionId, cardId, queryClient]);

    if (query.isPending) return <p className="p-6 text-muted">Loading…</p>;
    if (query.isError)
        return <p className="p-6 text-muted">Could not load this card.</p>;

    const data = query.data;
    const session = data.session;
    const current = data.executions.at(-1);

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

            <Chat
                messages={data.messages}
                streamingText={streamingText}
                pending={send.isPending}
                onSend={(text) => {
                    send.mutate(text);
                }}
            />

            {session?.pendingApproval && (
                <ApprovalPrompt
                    pending={session.pendingApproval}
                    busy={decide.isPending}
                    onDecide={(decision) => {
                        decide.mutate({ sessionId: session.id, decision });
                    }}
                />
            )}

            {current && (
                <section className="flex flex-col gap-2 border-t border-line pt-3">
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
                    <ActivityFeed activities={current.activities} />
                </section>
            )}
        </main>
    );
};
