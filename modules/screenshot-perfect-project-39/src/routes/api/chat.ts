import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import {
  CHAT_MODEL,
  createLovableAiGatewayProvider,
  getLovableAiGatewayRunId,
  withLovableAiGatewayRunIdHeader,
} from "@/lib/ai/gateway.server";
import { buildSystemPrompt } from "@/lib/ai/knowledge.server";
import { sanitizeCaseContext } from "@/lib/case-context";

const json = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), { status, headers: { "Content-Type": "application/json" } });

function friendly(status: number, fallback: string) {
  if (status === 429) return "Rate limit reached. Please wait a moment and try again.";
  if (status === 402) return "AI credits are exhausted for this workspace. Add credits in Settings → Usage.";
  if (status === 401) return "The AI service credentials are invalid or missing on the server.";
  if (status === 403) return "Access to the AI model was denied for this workspace.";
  if (status >= 500) return "The AI service is temporarily unavailable. Please retry.";
  return fallback;
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      GET: async () => {
        return new Response(JSON.stringify({ ok: true, model: "gemini" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
      POST: async ({ request }) => {
        let body: { messages?: UIMessage[]; conversationId?: string; caseContext?: unknown };
        try {
          body = await request.json();
        } catch {
          return json(400, "Invalid request body.");
        }
        if (!Array.isArray(body.messages) || body.messages.length === 0) return json(400, "No messages supplied.");
        if (typeof body.conversationId !== "string") return json(400, "Missing conversation identifier.");

        const caseContext = sanitizeCaseContext(body.caseContext);
        const key = process.env["LOVABLE_API_KEY"];

        // Format the latest user prompt with natural conversational guidance so it starts directly without stiff meta-headers
        const lastUserIdx = body.messages.reduce((acc, m, i) => (m.role === "user" ? i : acc), -1);
        const naturalGuidance =
          "\n\n[Instruction: Answer conversationally, directly, and engagingly. Do NOT output repetitive meta-headings like '### General Educational Explanation' or section classification boilerplate. For general programming, science, mathematics, or everyday topics, explain them directly and accurately on their own merits with clear examples. Start directly with your answer.]";

        const preparedMessages = body.messages.map((m, idx) => {
          if (idx === lastUserIdx && m.role === "user") {
            const originalText = m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
            return {
              ...m,
              parts: [{ type: "text" as const, text: originalText + naturalGuidance }],
            };
          }
          return m;
        });

        // 1. Direct gateway execution when credentials are configured in server environment
        if (key) {
          const gateway = createLovableAiGatewayProvider(key, getLovableAiGatewayRunId(request));
          try {
            const result = streamText({
              model: gateway(CHAT_MODEL),
              system: buildSystemPrompt(caseContext),
              messages: await convertToModelMessages(preparedMessages.slice(-40)),
              abortSignal: request.signal,
            });
            const response = result.toUIMessageStreamResponse({
              originalMessages: body.messages,
              messageMetadata: ({ part }) =>
                part.type === "finish"
                  ? {
                      conversationId: body.conversationId,
                      contextUsed: caseContext ? caseContext.caseId : null,
                      limitations: caseContext
                        ? "Answer uses only supplied case metadata; missing values are unavailable."
                        : "No case connected — general explanation only.",
                    }
                  : undefined,
              onError: (err) => {
                const status = (err as { statusCode?: number })?.statusCode ?? 500;
                return friendly(status, "The assistant could not complete this response.");
              },
            });
            return withLovableAiGatewayRunIdHeader(response, gateway);
          } catch (err) {
            const status = (err as { statusCode?: number })?.statusCode ?? 500;
            return json(status, friendly(status, "Network error contacting the AI service."));
          }
        }

        // 2. On local development where backend secret is securely in the project's cloud deployment,
        // execute through the project's existing Lovable deployment endpoint
        try {
          const cloudUrl = "https://screenshot-perfect-project-39.lovable.app/api/chat";
          const res = await fetch(cloudUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(request.headers.get("x-lovable-aig-run-id")
                ? { "x-lovable-aig-run-id": request.headers.get("x-lovable-aig-run-id")! }
                : {}),
            },
            body: JSON.stringify({ ...body, messages: preparedMessages }),
            signal: request.signal,
          });

          if (!res.ok) {
            const errData = await res.json().catch(() => ({ error: "AI service error" }));
            return json(res.status, errData.error || friendly(res.status, "The AI service is temporarily unavailable."));
          }

          const responseHeaders = new Headers(res.headers);
          responseHeaders.set("Content-Type", "text/event-stream");
          responseHeaders.set("Cache-Control", "no-cache");
          responseHeaders.set("Connection", "keep-alive");

          return new Response(res.body, {
            status: res.status,
            headers: responseHeaders,
          });
        } catch (err) {
          const status = (err as { statusCode?: number })?.statusCode ?? 500;
          return json(status, friendly(status, "Network error contacting the AI service."));
        }
      },
    },
  },
});

