"use client";

import { useState } from "react";

type InlineCreateProps = {
    /** Label for the collapsed trigger button, e.g. "+ Add card". */
    label: string;
    /** Placeholder shown in the open input. */
    placeholder: string;
    /** Called with the trimmed text on submit; blank submits are ignored. */
    onCreate: (text: string) => void;
};

/**
 * A collapsed "add" button that expands into a single-line input — the shared
 * create affordance for columns and cards. Stays presentational: it owns only
 * its open/draft state and hands the trimmed text to `onCreate`.
 */
export const InlineCreate = ({
    label,
    placeholder,
    onCreate,
}: InlineCreateProps) => {
    const [open, setOpen] = useState(false);
    const [text, setText] = useState("");

    const submit = () => {
        const trimmed = text.trim();
        if (trimmed.length > 0) onCreate(trimmed);
        setText("");
        setOpen(false);
    };

    if (!open) {
        return (
            <button
                type="button"
                onClick={() => {
                    setOpen(true);
                }}
                className="rounded-md px-2 py-1 text-left text-sm text-muted hover:bg-line/60 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            >
                {label}
            </button>
        );
    }

    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                submit();
            }}
        >
            <input
                autoFocus
                aria-label={placeholder}
                value={text}
                placeholder={placeholder}
                onChange={(e) => {
                    setText(e.target.value);
                }}
                onBlur={submit}
                onKeyDown={(e) => {
                    if (e.key === "Escape") {
                        setText("");
                        setOpen(false);
                    }
                }}
                className="w-full rounded-md border border-line bg-card px-2 py-1 text-sm text-primary focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            />
        </form>
    );
};
