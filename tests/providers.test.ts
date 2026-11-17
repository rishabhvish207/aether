import { describe, it, expect } from "vitest";
import { ProviderClient, eventData } from "../src/core/providers";
import { defaults, localProvider } from "../src/core/domain";
function stream(text: string, bytes = 1) {
  const encoded = new TextEncoder().encode(text);
  return new ReadableStream<Uint8Array>({
    start(c) {
      for (let i = 0; i < encoded.length; i += bytes)
        c.enqueue(encoded.slice(i, i + bytes));
      c.close();
    },
  });
}
const signal = () => new AbortController().signal;
describe("compatible SSE events", () => {
  it("joins multiline data, ignores comments/metadata, and preserves Unicode", async () => {
    const events = [];
    for await (const data of eventData(
      stream(
        ': keepalive\r\nevent: message\r\nid: 7\r\ndata: {"choices":\r\ndata: [{"delta":{"content":"世界"}}]}\r\n\r\ndata: [DONE]',
      ),
      signal(),
    ))
      events.push(data);
    expect(events).toEqual([
      '{"choices":\n[{"delta":{"content":"世界"}}]}',
      "[DONE]",
    ]);
  });
  it("parses multiline content and usage through the actual adapter", async () => {
    const client = new ProviderClient(
      { ...localProvider, kind: "openai" },
      async () =>
        new Response(
          stream(
            'data: {"choices":\ndata: [{"delta":{"content":"héllo"}}]}\n\ndata: {"choices":[],\ndata: "usage":{"prompt_tokens":4,"completion_tokens":2}}\n\ndata: [DONE]\n\n',
          ),
        ),
    );
    const result = [];
    for await (const d of client.chat("test", [], defaults().options, signal()))
      result.push(d);
    expect(result[0].text).toBe("héllo");
    expect(result[1].metrics?.outputTokens).toBe(2);
  });
  it("bounds accumulated event data across many small lines", async () => {
    await expect(async () => {
      for await (const d of eventData(
        stream(
          Array(1100)
            .fill("data: " + "x".repeat(4096) + "\n")
            .join(""),
          4096,
        ),
        signal(),
      ))
        void d;
    }).rejects.toThrow("safety limit");
  });
});
describe("untrusted model management responses", () => {
  it("rejects invalid model identities and sizes", async () => {
    for (const model of [{ name: 4 }, { name: "" }, { name: "m", size: -1 }]) {
      const client = new ProviderClient(localProvider, async () =>
        Response.json({ models: [model] }),
      );
      await expect(client.models()).rejects.toThrow();
    }
  });
  it("rejects malformed compatible inventory and capability reports", async () => {
    const compatible = new ProviderClient(
      { ...localProvider, kind: "openai" },
      async () => Response.json({ data: [{ id: null }] }),
    );
    await expect(compatible.models()).rejects.toThrow();
    const local = new ProviderClient(localProvider, async () =>
      Response.json({ capabilities: "vision" }),
    );
    await expect(local.show("m")).rejects.toThrow();
  });
  it("accepts valid empty inventories and preserves unknown metadata", async () => {
    const empty = new ProviderClient(localProvider, async () =>
      Response.json({ models: [] }),
    );
    expect(await empty.models()).toEqual([]);
    const client = new ProviderClient(localProvider, async () =>
      Response.json({
        capabilities: ["vision"],
        details: { family: "example" },
      }),
    );
    expect(await client.show("m")).toEqual({
      capabilities: ["vision"],
      details: { family: "example" },
    });
  });
  it("rejects truncated and invalid pull progress instead of claiming success", async () => {
    for (const body of [
      '{"status":"downloading","completed":1,"total":2}\n',
      '{"status":"downloading","completed":3,"total":2}\n',
      '{"status":"downloading","completed":-1}\n',
    ]) {
      const client = new ProviderClient(
        localProvider,
        async () => new Response(stream(body)),
      );
      await expect(async () => {
        for await (const d of client.pull("m", signal())) void d;
      }).rejects.toThrow();
    }
  });
  it("reports successful provider-managed pulls and server errors", async () => {
    const client = new ProviderClient(
      localProvider,
      async () =>
        new Response(
          stream(
            '{"status":"downloading","completed":2,"total":2}\n{"status":"success"}\n',
          ),
        ),
    );
    const events = [];
    for await (const d of client.pull("m", signal())) events.push(d);
    expect(events.at(-1)?.status).toBe("success");
    const invalid = new ProviderClient(
      localProvider,
      async () => new Response(stream('{"error":"disk full"}\n')),
    );
    await expect(async () => {
      for await (const d of invalid.pull("m", signal())) void d;
    }).rejects.toThrow("disk full");
  });
});
