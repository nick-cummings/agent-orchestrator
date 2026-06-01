import { Snippet } from "@/components/Snippet/Snippet";

export default function Home() {
    return (
        <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 p-8">
            <h1 className="text-2xl font-semibold">Orchestrator</h1>
            <p className="text-sm">
                Personal workspace for orchestrating cloud coding agents. Design
                phase — see <code>docs/</code>.
            </p>
            <Snippet text="The card-face snippet renders a one-line preview of the latest message, truncated to fit." />
        </main>
    );
}
