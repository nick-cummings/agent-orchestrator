import { truncate } from "@/lib/format";

type SnippetProps = {
    /** The full message text to preview. */
    text: string;
    /** Maximum characters before truncation. */
    max?: number;
};

/**
 * The card-face snippet: a one-line preview of the latest message. Delegates
 * truncation to `lib/format` so the component stays thin (the wiring is what
 * the integration test asserts).
 */
export const Snippet = ({ text, max = 80 }: SnippetProps) => (
    <p className="text-sm">{truncate(text, max)}</p>
);
