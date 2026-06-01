import type {
    ActionCategory,
    ApprovalDecision,
    ApprovalPolicy,
    Config,
} from "@/lib/core/schemas";

/**
 * Config inheritance: user → board → card, most-specific-defined-wins
 * (implementation-plan §6). Merge semantics (see ADR 0001):
 *   - scalars & arrays: a defined value at a more specific tier REPLACES the
 *     less specific one (arrays are not concatenated);
 *   - `approvalPolicy` & `routing`: merged PER KEY, so a tier can override a
 *     single category/field and inherit the rest;
 *   - `undefined` everywhere → the field stays unset and falls back to BASE.
 */

/** Conservative defaults: reads/branch-writes auto, everything risky asks. */
export const DEFAULT_POLICY: Required<ApprovalPolicy> = {
    read: "auto",
    branch_write: "auto",
    destructive: "ask",
    network: "ask",
    merge_deploy: "ask",
    spend: "ask",
};

/** The global baseline every effective config resolves against (v1 binding). */
export const BASE_CONFIG: Config = {
    routing: { brain: "claude", executor: "jules" },
    approvalPolicy: DEFAULT_POLICY,
    skillIds: [],
    verbosity: "verbose",
    defaultRepos: [],
    requirePlanApproval: true,
};

/** Merge two partial records, dropping to `undefined` when neither defines anything. */
const mergeRecord = <T extends object>(
    base: T | undefined,
    override: T | undefined,
): T | undefined => {
    if (!base && !override) return undefined;
    // Both branches are the same shape T; the spread widens to {}, so reassert.
    return { ...base, ...override } as T;
};

const mergeTwo = (base: Config, override: Config): Config => {
    const result: Config = {};

    // Records merge per key; scalars/arrays take the most specific defined value.
    // Only assign when defined so absent fields read as genuinely unset.
    const routing = mergeRecord(base.routing, override.routing);
    if (routing) result.routing = routing;

    const approvalPolicy = mergeRecord(
        base.approvalPolicy,
        override.approvalPolicy,
    );
    if (approvalPolicy) result.approvalPolicy = approvalPolicy;

    // systemPrompt has no base default, so guard it: an unset prompt must stay
    // absent rather than become `undefined`. The rest always have a base value.
    const systemPrompt = override.systemPrompt ?? base.systemPrompt;
    if (systemPrompt !== undefined) result.systemPrompt = systemPrompt;

    result.skillIds = override.skillIds ?? base.skillIds;
    result.verbosity = override.verbosity ?? base.verbosity;
    result.defaultRepos = override.defaultRepos ?? base.defaultRepos;
    result.requirePlanApproval =
        override.requirePlanApproval ?? base.requirePlanApproval;

    return result;
};

/**
 * Effective config for a card. Resolves against BASE_CONFIG so the result is
 * fully populated; clearing a card override falls back to board, then user,
 * then base. `board`/`card` default to empty so callers can omit absent tiers.
 */
export const resolveConfig = (
    user: Config,
    board: Config = {},
    card: Config = {},
): Config => [BASE_CONFIG, user, board, card].reduce(mergeTwo);

/** Whether a tool in `category` runs silently (`auto`) or needs a tap (`ask`). */
export const decideApproval = (
    policy: ApprovalPolicy | undefined,
    category?: ActionCategory,
): ApprovalDecision => {
    if (!category) return "auto";
    return policy?.[category] ?? DEFAULT_POLICY[category];
};
