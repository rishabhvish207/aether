import { z } from "zod";
import {
  type Provider,
  type Model,
  type Message,
  type Options,
  type Metrics,
  textOf,
} from "./domain";
const secrets = new Map<string, string>();
export function setSessionSecret(id: string, value: string) {
  if (value) secrets.set(id, value);
  else secrets.delete(id);
}
export function transferSessionSecret(from: string, to: string) {
  const key = secrets.get(from);
  if (key && from !== to) {
    secrets.set(to, key);
    secrets.delete(from);
  }
}
export type Delta = { text?: string; thinking?: string; metrics?: Metrics };
export class ProviderError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}
export async function* lines(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  const abort = () => {
    void reader.cancel();
  };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      pending += decoder.decode(value, { stream: !done });
      let i;
      while ((i = pending.indexOf("\n")) >= 0) {
        if (i > 4 * 1024 * 1024)
          throw new ProviderError("Provider stream line exceeds safety limit");
        yield pending.slice(0, i).replace(/\r$/, "");
        pending = pending.slice(i + 1);
      }
      if (pending.length > 4 * 1024 * 1024)
        throw new Error("Provider stream line exceeds safety limit");
      if (done) break;
    }
    if (pending) yield pending;
  } finally {
    signal?.removeEventListener("abort", abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
/** Assemble complete SSE events before parsing JSON; data fields may span lines. */
export async function* eventData(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  let data: string[] = [];
  let size = 0;
  for await (const line of lines(body, signal)) {
    if (line === "") {
      if (data.length) yield data.join("\n");
      data = [];
      size = 0;
      continue;
    }
    if (line.startsWith(":")) continue;
    const colon = line.indexOf(":");
    const field = colon < 0 ? line : line.slice(0, colon);
    if (field !== "data") continue;
    let value = colon < 0 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    size += value.length + 1;
    if (size > 4 * 1024 * 1024)
      throw new ProviderError("Provider SSE event exceeds safety limit");
    data.push(value);
  }
  // Some compatible servers close without a final blank separator.
  if (data.length) yield data.join("\n");
}
export class ProviderClient {
  constructor(
    public connection: Provider,
    private transport: typeof fetch = (...args) => fetch(...args),
  ) {}
  get ollama() {
    return this.connection.kind === "ollama";
  }
  async request(path: string, body?: unknown, signal?: AbortSignal) {
    const c = this.connection;
    const combined = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(c.timeout)])
      : AbortSignal.timeout(c.timeout);
    let response: Response;
    try {
      response = await this.transport(c.baseUrl.replace(/\/$/, "") + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          "Content-Type": "application/json",
          ...(secrets.get(c.id)
            ? { Authorization: `Bearer ${secrets.get(c.id)}` }
            : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: combined,
      });
    } catch (e) {
      if (combined.aborted) throw combined.reason;
      throw new ProviderError(
        `Cannot reach ${c.baseUrl}. Check the server, endpoint and browser CORS permissions. ${e instanceof Error ? e.message : ""}`,
      );
    }
    if (!response.ok)
      throw new ProviderError(
        `${response.status === 401 || response.status === 403 ? "Unauthorized: check credentials" : `Provider HTTP ${response.status}`}: ${(await response.text()).slice(0, 500)}`,
        response.status,
      );
    return response;
  }
  async models(signal?: AbortSignal): Promise<Model[]> {
    const data = await (
      await this.request(
        this.ollama ? "/api/tags" : "/models",
        undefined,
        signal,
      )
    ).json();
    if (this.ollama) {
      if (!Array.isArray(data.models))
        throw new ProviderError("Incompatible response: missing models");
      const models = z
        .array(
          z.object({
            name: z.string().min(1),
            size: z.number().nonnegative().optional(),
            details: z.record(z.string(), z.unknown()).optional(),
          }),
        )
        .parse(data.models);
      return models.map((m) => ({
        id: m.name,
        size: m.size,
        details: m.details,
      }));
    }
    if (!Array.isArray(data.data))
      throw new ProviderError("Incompatible response: missing model data");
    return z.array(z.object({ id: z.string().min(1) })).parse(data.data);
  }
  async show(model: string): Promise<Record<string, unknown>> {
    return this.ollama
      ? modelInfoSchema.parse(
          await (await this.request("/api/show", { model })).json(),
        )
      : {
          capabilities: [],
          note: "Server model capability discovery unavailable; image/audio/tools are not assumed.",
        };
  }
  async loaded() {
    if (!this.ollama)
      throw new Error("Loaded-model telemetry is not exposed by this adapter");
    return (await this.request("/api/ps")).json();
  }
  async removeModel(model: string) {
    if (!this.ollama) throw new Error("Model removal unsupported");
    const c = this.connection;
    const r = await this.transport(
      c.baseUrl.replace(/\/$/, "") + "/api/delete",
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...(secrets.get(c.id)
            ? { Authorization: `Bearer ${secrets.get(c.id)}` }
            : {}),
        },
        body: JSON.stringify({ model }),
        signal: AbortSignal.timeout(c.timeout),
      },
    );
    if (!r.ok) throw new ProviderError(`Removal failed: HTTP ${r.status}`);
  }
  async *pull(model: string, signal: AbortSignal) {
    if (!this.ollama) throw new Error("Pull unsupported");
    const r = await this.request("/api/pull", { model, stream: true }, signal);
    if (!r.body) throw new Error("Empty pull response");
    let complete = false;
    for await (const line of lines(r.body, signal)) {
      if (!line.trim()) continue;
      const d = pullEventSchema.parse(JSON.parse(line));
      if (d.error) throw new ProviderError(d.error);
      if (!d.status)
        throw new ProviderError("Incompatible pull response: missing status");
      if (
        d.completed !== undefined &&
        d.total !== undefined &&
        d.completed > d.total
      )
        throw new ProviderError("Invalid download progress");
      complete = d.status === "success";
      yield { status: d.status, completed: d.completed, total: d.total };
    }
    if (!complete)
      throw new ProviderError(
        "Download stream ended before success; reconnect to inspect runtime state",
      );
  }
  async *chat(
    model: string,
    messages: Message[],
    options: Options,
    signal: AbortSignal,
    extra: { keepAlive?: string; think?: boolean } = {},
  ): AsyncGenerator<Delta> {
    const start = performance.now();
    let first: number | undefined;
    let finished = false;
    const wire = messages
      .filter((m) => m.status !== "error")
      .map((m) => ({
        role: m.role,
        content:
          textOf(m) +
          m.parts
            .filter((p) => p.type === "file")
            .map((p) => `\n\nAttached file ${p.name}:\n${p.text}`)
            .join(""),
        ...(m.parts.some((p) => p.type === "image")
          ? {
              images: m.parts
                .filter((p) => p.type === "image")
                .map((p) => p.text.split(",")[1]),
            }
          : {}),
      }));
    const body = this.ollama
      ? {
          model,
          messages: wire,
          options,
          stream: true,
          keep_alive: extra.keepAlive,
          ...(extra.think !== undefined ? { think: extra.think } : {}),
        }
      : {
          model,
          messages: wire,
          temperature: options.temperature,
          top_p: options.top_p,
          seed: options.seed,
          stop: options.stop.length ? options.stop : undefined,
          stream: true,
          stream_options: { include_usage: true },
        };
    const response = await this.request(
      this.ollama ? "/api/chat" : "/chat/completions",
      body,
      signal,
    );
    if (!response.body) throw new ProviderError("Provider returned no stream");
    const payloads = this.ollama
      ? lines(response.body, signal)
      : eventData(response.body, signal);
    for await (const raw of payloads) {
      if (!raw.trim()) continue;
      if (raw === "[DONE]") {
        finished = true;
        break;
      }
      const d = streamEventSchema.parse(JSON.parse(raw));
      if (d.error)
        throw new ProviderError(
          typeof d.error === "string"
            ? d.error
            : d.error.message || "Provider error",
        );
      const delta = this.ollama ? d.message : d.choices?.[0]?.delta;
      const text = delta?.content;
      const thinking = delta?.thinking ?? delta?.reasoning_content;
      if (text && first === undefined) first = performance.now() - start;
      if (text || thinking) yield { text: text ?? undefined, thinking };
      if (d.done || d.usage) {
        if (d.done) finished = true;
        const rate = (n: number | undefined, t: number | undefined) =>
          n !== undefined && t !== undefined && t > 0
            ? n / (t / 1e9)
            : undefined;
        yield {
          metrics: {
            ttftMs: first,
            totalMs: performance.now() - start,
            promptTokens: d.prompt_eval_count ?? d.usage?.prompt_tokens,
            outputTokens: d.eval_count ?? d.usage?.completion_tokens,
            promptPerSecond: rate(d.prompt_eval_count, d.prompt_eval_duration),
            outputPerSecond: rate(d.eval_count, d.eval_duration),
            loadMs: d.load_duration ? d.load_duration / 1e6 : undefined,
          },
        };
      }
    }
    if (!finished)
      throw new ProviderError(
        "Provider stream ended before completion; partial response retained",
      );
  }
}

const tokenMetric = z.number().finite().nonnegative().optional();
const deltaSchema = z.object({
  content: z.string().nullable().optional(),
  thinking: z.string().optional(),
  reasoning_content: z.string().optional(),
});
const streamEventSchema = z.object({
  error: z.union([z.string(), z.object({ message: z.string() })]).optional(),
  message: deltaSchema.optional(),
  choices: z.array(z.object({ delta: deltaSchema.optional() })).optional(),
  done: z.boolean().optional(),
  usage: z
    .object({ prompt_tokens: tokenMetric, completion_tokens: tokenMetric })
    .optional(),
  prompt_eval_count: tokenMetric,
  eval_count: tokenMetric,
  prompt_eval_duration: tokenMetric,
  eval_duration: tokenMetric,
  load_duration: tokenMetric,
});

const modelInfoSchema = z
  .object({ capabilities: z.array(z.string()).optional() })
  .passthrough();
const pullEventSchema = z.object({
  status: z.string().optional(),
  completed: z.number().int().nonnegative().optional(),
  total: z.number().int().nonnegative().optional(),
  error: z.string().optional(),
});
