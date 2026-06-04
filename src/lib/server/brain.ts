import Anthropic from "@anthropic-ai/sdk";

import { createClaudeBrain } from "@/lib/adapters/claude";
import type { ConversationProvider } from "@/lib/core/contracts";

/**
 * Server-side composition of the Brain. `new Anthropic()` resolves auth from the
 * environment — `ANTHROPIC_API_KEY` today, the Max-subscription token
 * (`ANTHROPIC_AUTH_TOKEN`) when that path is live, with no code change. Routing
 * is hard-wired to Claude in Phase 2 (Phase 3 reads it from the card config).
 */
export const getBrain = (): ConversationProvider =>
    createClaudeBrain({ client: new Anthropic() });
