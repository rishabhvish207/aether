import { type Provider } from "./domain";
import { ProviderClient } from "./providers";
import { toolRegistry, type Turn } from "./agents";
import { z } from "zod";
const callSchema = z.object({
  id: z.string().optional(),
  function: z.object({
    name: z.string(),
    arguments: z.union([z.string(), z.record(z.string(), z.unknown())]),
  }),
});
export async function agentTurn(
  provider: Provider,
  model: string,
  messages: Record<string, unknown>[],
  signal: AbortSignal,
): Promise<Turn> {
  const client = new ProviderClient(provider);
  const normalized = client.ollama
    ? messages.map((m) => ({
        ...m,
        ...(Array.isArray(m.tool_calls)
          ? {
              tool_calls: m.tool_calls.map(
                (c: { function: { name: string; arguments: string } }) => ({
                  ...c,
                  function: {
                    ...c.function,
                    arguments: JSON.parse(c.function.arguments),
                  },
                }),
              ),
            }
          : {}),
      }))
    : messages;
  const response = await client.request(
    client.ollama ? "/api/chat" : "/chat/completions",
    {
      model,
      messages: normalized,
      stream: false,
      tools: Object.entries(toolRegistry).map(([name, t]) => ({
        type: "function",
        function: {
          name,
          description: t.description,
          parameters: t.parameters,
        },
      })),
      ...(client.ollama
        ? { options: { num_predict: 1024 } }
        : { max_tokens: 1024 }),
    },
    signal,
  );
  const d = await response.json();
  if (d.error) throw new Error("Agent provider returned an error");
  const m = client.ollama ? d.message : d.choices?.[0]?.message;
  if (!m || typeof m.content !== "string")
    throw new Error("Incompatible agent response");
  const calls = z
    .array(callSchema)
    .max(8)
    .parse(m.tool_calls ?? []);
  return {
    content: m.content,
    calls: calls.map((c, i) => ({
      id: c.id ?? `call-${i}`,
      name: c.function.name,
      arguments:
        typeof c.function.arguments === "string"
          ? JSON.parse(c.function.arguments)
          : c.function.arguments,
    })),
    outputTokens: d.eval_count ?? d.usage?.completion_tokens,
  };
}
