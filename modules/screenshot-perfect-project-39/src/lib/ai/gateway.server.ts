import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createLovableAiGatewayRunIdFetch } from "./run-id.ts";
export { getLovableAiGatewayRunId, withLovableAiGatewayRunIdHeader } from "./run-id.ts";

export const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1";
// Gemini model, configured server-side only.
export const CHAT_MODEL = "google/gemini-3-flash-preview";

export function createLovableAiGatewayProvider(lovableApiKey: string, initialRunId: string | undefined) {
  const runIdFetch = createLovableAiGatewayRunIdFetch(initialRunId);
  const provider = createOpenAICompatible({
    name: "lovable",
    baseURL: GATEWAY_URL,
    headers: {
      "Lovable-API-Key": lovableApiKey,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
    fetch: runIdFetch.fetch,
  });
  return Object.assign(provider, {
    getRunId: runIdFetch.getRunId,
    waitForRunId: runIdFetch.waitForRunId,
  });
}

