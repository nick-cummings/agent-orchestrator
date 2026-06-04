"use client";

import { useState } from "react";

import type { ContentBlock } from "@/lib/core/schemas";
import type { Message } from "@/lib/db/messages";

/**
 * The card conversation: a message list (domain `ContentBlock`s rendered by
 * role) plus a composer. Live `text` deltas render as a transient streaming
 * bubble until the persisted `message` arrives. Tool calls/results show as muted
 * chips — the engine detail lives in the ActivityFeed below.
 */

const Block = ({ block }: { block: ContentBlock }) => {
    if (block.type === "text") {
        return (
            <p className="whitespace-pre-wrap text-sm text-primary">
                {block.text}
            </p>
        );
    }
    if (block.type === "thinking") {
        return (
            <p className="text-sm whitespace-pre-wrap text-muted italic">
                {block.text}
            </p>
        );
    }
    if (block.type === "tool_call") {
        return (
            <p className="text-xs text-muted">
                → <span className="font-medium">{block.name}</span>
            </p>
        );
    }
    if (block.type === "tool_result") {
        return <p className="text-xs text-muted">✓ result</p>;
    }
    return null;
};

const roleClass: Partial<Record<string, string>> = {
    user: "items-end",
    assistant: "items-start",
    tool: "items-start",
};

const Bubble = ({ role, blocks }: { role: string; blocks: ContentBlock[] }) => (
    <li className={`flex flex-col gap-1 ${roleClass[role] ?? "items-start"}`}>
        <span className="text-xs text-muted">{role}</span>
        <div
            className={`max-w-[85%] rounded-lg border border-line px-3 py-2 ${
                role === "user" ? "bg-surface" : "bg-card"
            }`}
        >
            {blocks.map((block, i) => (
                <Block key={i} block={block} />
            ))}
        </div>
    </li>
);

export const Chat = ({
    messages,
    streamingText,
    pending,
    onSend,
}: {
    messages: Message[];
    streamingText: string;
    pending: boolean;
    onSend: (text: string) => void;
}) => {
    const [draft, setDraft] = useState("");

    const submit = () => {
        const text = draft.trim();
        if (text.length === 0 || pending) return;
        onSend(text);
        setDraft("");
    };

    return (
        <div className="flex flex-col gap-3">
            <ul className="flex flex-col gap-3">
                {messages.map((message) => (
                    <Bubble
                        key={message.id}
                        role={message.role}
                        blocks={message.contentBlocks}
                    />
                ))}
                {streamingText.length > 0 && (
                    <Bubble
                        role="assistant"
                        blocks={[{ type: "text", text: `${streamingText}▍` }]}
                    />
                )}
            </ul>

            <form
                className="flex gap-2"
                onSubmit={(e) => {
                    e.preventDefault();
                    submit();
                }}
            >
                <input
                    aria-label="Message"
                    value={draft}
                    placeholder={
                        pending ? "Claude is working…" : "Message Claude…"
                    }
                    disabled={pending}
                    onChange={(e) => {
                        setDraft(e.target.value);
                    }}
                    className="flex-1 rounded-md border border-line bg-card px-3 py-1.5 text-sm text-primary disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                />
                <button
                    type="submit"
                    disabled={pending}
                    className="rounded-md bg-accent px-3 text-sm text-accent-foreground disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                >
                    Send
                </button>
            </form>
        </div>
    );
};
