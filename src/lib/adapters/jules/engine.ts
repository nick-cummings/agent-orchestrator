import type {
    ExecutionEngine,
    ExecutionResult,
    ResolvedCredential,
    StartTaskInput,
} from "@/lib/core/contracts";
import type { NormalizedActivity, RepoRef } from "@/lib/core/schemas";

import { extractPrUrl, toDomainActivity, toExecutionState } from "./normalize";
import { JulesActivitiesResponse, JulesSession } from "./wire";

/**
 * `createJulesEngine` — the real `ExecutionEngine` over the Jules v1alpha REST
 * API. Deps are injected (fetch/baseUrl/apiKey) so the factory is unit-testable
 * with a mocked `fetch`. Auth is the Jules API key: per-call `cred` overrides
 * the deps key (write ops), reads use the deps key (the contract gives reads no
 * cred). The `apiKey` deps field is the Phase-1 stand-in for `CredentialProvider`.
 */
export type JulesDeps = {
    fetch: typeof fetch;
    baseUrl: string; // e.g. https://jules.googleapis.com/v1alpha
    apiKey: string;
};

const deepLinkFor = (ref: string): string =>
    `https://jules.google/sessions/${ref}`;

const parseRepo = (repoUrl: string): { owner: string; repo: string } => {
    const m = /github\.com[/:]([^/]+)\/([^/.]+)/.exec(repoUrl);
    if (!m) throw new Error(`Unrecognized GitHub repo URL: ${repoUrl}`);
    return { owner: m[1], repo: m[2] };
};

const sourceContext = (repo: RepoRef) => {
    const { owner, repo: name } = parseRepo(repo.repoUrl);
    return {
        source: `sources/github-${owner}-${name}`,
        githubRepoContext: { startingBranch: repo.branch },
    };
};

export const createJulesEngine = (deps: JulesDeps): ExecutionEngine => {
    const auth = (cred?: ResolvedCredential): string =>
        cred?.value ?? deps.apiKey;

    const request = async (
        key: string,
        method: string,
        path: string,
        body?: unknown,
    ): Promise<unknown> => {
        const response = await deps.fetch(`${deps.baseUrl}${path}`, {
            method,
            headers: {
                "content-type": "application/json",
                "x-goog-api-key": key,
            },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        if (!response.ok) {
            throw new Error(
                `Jules ${method} ${path} failed (${String(response.status)})`,
            );
        }
        return response.json();
    };

    const getSession = async (ref: string): Promise<JulesSession> =>
        JulesSession.parse(
            await request(deps.apiKey, "GET", `/sessions/${ref}`),
        );

    const listActivities = async (
        ref: string,
        since?: string,
    ): Promise<NormalizedActivity[]> => {
        const collected: NormalizedActivity[] = [];
        let pageToken: string | undefined;
        do {
            const qs = new URLSearchParams({ pageSize: "100" });
            if (pageToken) qs.set("pageToken", pageToken);
            const parsed = JulesActivitiesResponse.parse(
                await request(
                    deps.apiKey,
                    "GET",
                    `/sessions/${ref}/activities?${qs.toString()}`,
                ),
            );
            collected.push(...parsed.activities.map(toDomainActivity));
            pageToken = parsed.nextPageToken;
        } while (pageToken);

        const sorted = collected.sort((a, b) =>
            a.cursor.localeCompare(b.cursor),
        );
        return since ? sorted.filter((a) => a.cursor > since) : sorted;
    };

    return {
        id: "jules",
        caps: {
            conversational: true,
            planApproval: true,
            streaming: false, // poll
            vcs: ["github"],
            selfHosted: false,
        },
        start: async (input: StartTaskInput, cred) => {
            const session = JulesSession.parse(
                await request(auth(cred), "POST", "/sessions", {
                    prompt: input.prompt,
                    sourceContext: sourceContext(input.repo),
                    requirePlanApproval: input.requirePlanApproval ?? true,
                    automationMode: "AUTO_CREATE_PR",
                }),
            );
            const id = session.id ?? session.name?.split("/")[1];
            if (!id) throw new Error("Jules session response missing id");
            return {
                id,
                engine: "jules",
                externalRef: id,
                deepLink: session.url ?? deepLinkFor(id),
            };
        },
        sendMessage: async (ref, message, cred) => {
            await request(auth(cred), "POST", `/sessions/${ref}:sendMessage`, {
                prompt: message,
            });
        },
        listActivities,
        getStatus: async (ref) => {
            const session = await getSession(ref);
            return {
                state: toExecutionState(session.state),
                updatedAt: session.updateTime ?? "",
            };
        },
        approvePlan: async (ref, cred) => {
            await request(
                auth(cred),
                "POST",
                `/sessions/${ref}:approvePlan`,
                {},
            );
        },
        getResult: async (ref): Promise<ExecutionResult> => {
            const prUrl = extractPrUrl(await getSession(ref));
            return prUrl ? { prUrl } : {};
        },
        deepLink: deepLinkFor,
    };
};
