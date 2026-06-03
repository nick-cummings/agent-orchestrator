"use client";

import { useState } from "react";

import type { StartExecutionBody } from "@/lib/api/requests";

/**
 * The "start a cloud coding task" form, shown when a card has no execution yet.
 * Repo is entered as `owner/name@branch` (branch defaults to `main`) — a
 * Phase-1 stand-in until the Connections/repo picker (Phase 3). Parsing +
 * validation happen here; the parent runs the mutation.
 */

const parseRepo = (raw: string): StartExecutionBody["repo"] | null => {
    const [path, branch = "main"] = raw.trim().split("@");
    const [owner, name] = path.split("/");
    if (!owner || !name) return null;
    return { owner, name, branch };
};

export const StartTaskForm = ({
    pending,
    onStart,
}: {
    pending: boolean;
    onStart: (body: StartExecutionBody) => void;
}) => {
    const [prompt, setPrompt] = useState("");
    const [repo, setRepo] = useState("");
    const [requirePlanApproval, setRequirePlanApproval] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const submit = () => {
        if (prompt.trim().length === 0) {
            setError("Describe the task.");
            return;
        }
        const parsedRepo = parseRepo(repo);
        if (!parsedRepo) {
            setError("Repo must be owner/name@branch.");
            return;
        }
        setError(null);
        onStart({
            prompt: prompt.trim(),
            repo: parsedRepo,
            requirePlanApproval,
        });
    };

    return (
        <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
                e.preventDefault();
                submit();
            }}
        >
            <label className="flex flex-col gap-1 text-sm text-muted">
                Task
                <textarea
                    aria-label="Task prompt"
                    value={prompt}
                    rows={3}
                    placeholder="Describe what Jules should do…"
                    onChange={(e) => {
                        setPrompt(e.target.value);
                    }}
                    className="rounded-md border border-line bg-card p-2 text-sm text-primary focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                />
            </label>

            <label className="flex flex-col gap-1 text-sm text-muted">
                Repository
                <input
                    aria-label="Repository"
                    value={repo}
                    placeholder="owner/name@main"
                    onChange={(e) => {
                        setRepo(e.target.value);
                    }}
                    className="rounded-md border border-line bg-card p-2 text-sm text-primary focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                />
            </label>

            <label className="flex items-center gap-2 text-sm text-primary">
                <input
                    type="checkbox"
                    checked={requirePlanApproval}
                    onChange={(e) => {
                        setRequirePlanApproval(e.target.checked);
                    }}
                />
                Require plan approval
            </label>

            {error && <p className="text-sm text-danger">{error}</p>}

            <button
                type="submit"
                disabled={pending}
                className="self-start rounded-md bg-accent px-3 py-1.5 text-sm text-accent-foreground disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            >
                {pending ? "Starting…" : "Start task"}
            </button>
        </form>
    );
};
