import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { BrowserStore, saveConversation } from "../src/core/storage";
import { ProviderClient, lines } from "../src/core/providers";
import {
  defaults,
  localProvider,
  starters,
  profileSchema,
  uid,
  type Conversation,
} from "../src/core/domain";
import {
  makeBackup,
  validateBackup,
  restoreBackup,
  parseProfiles,
  exportConversation,
} from "../src/core/portable";
function stream(text: string, bytes = 1) {
  const data = new TextEncoder().encode(text);
  return new ReadableStream<Uint8Array>({
    start(c) {
      for (let i = 0; i < data.length; i += bytes)
        c.enqueue(data.slice(i, i + bytes));
      c.close();
    },
  });
}
const conversation = (temporary = false): Conversation => ({
  id: uid(),
  title: "Test",
  providerId: "local-ollama",
  model: "test",
  profileId: "",
  messages: [],
  temporary,
  pinned: false,
  folder: "",
  createdAt: "now",
  updatedAt: "now",
});
describe("stream boundary", () => {
  it("preserves split UTF-8, CRLF and unterminated final lines", async () => {
    const result = [];
    for await (const l of lines(stream("héllo\r\n世界\nfinal"))) result.push(l);
    expect(result).toEqual(["héllo", "世界", "final"]);
  });
  it("separates thinking and computes only provider-derived token rates", async () => {
    const text =
      JSON.stringify({ message: { thinking: "Consider" } }) +
      "\n" +
      JSON.stringify({ message: { content: "你好" } }) +
      "\n" +
      JSON.stringify({
        done: true,
        eval_count: 20,
        eval_duration: 2e9,
        prompt_eval_count: 10,
        prompt_eval_duration: 1e9,
      }) +
      "\n";
    const client = new ProviderClient(
      localProvider,
      async () => new Response(stream(text)),
    );
    const ds = [];
    for await (const d of client.chat(
      "test",
      [],
      defaults().options,
      new AbortController().signal,
    ))
      ds.push(d);
    expect(ds[0].thinking).toBe("Consider");
    expect(ds[1].text).toBe("你好");
    expect(ds[2].metrics?.outputPerSecond).toBe(10);
  });
  it("reads compatible SSE and usage", async () => {
    const p = { ...localProvider, kind: "openai" as const };
    const client = new ProviderClient(
      p,
      async () =>
        new Response(
          stream(
            'data: {"choices":[{"delta":{"content":"hi"}}]}\n\ndata: {"usage":{"completion_tokens":3,"prompt_tokens":2}}\n\ndata: [DONE]\n\n',
          ),
        ),
    );
    const ds = [];
    for await (const d of client.chat(
      "m",
      [],
      defaults().options,
      new AbortController().signal,
    ))
      ds.push(d);
    expect(ds[0].text).toBe("hi");
    expect(ds[1].metrics?.outputTokens).toBe(3);
    expect(ds[1].metrics?.outputPerSecond).toBeUndefined();
  });
  it("rejects prematurely ended stream", async () => {
    const client = new ProviderClient(
      localProvider,
      async () => new Response(stream('{"message":{"content":"partial"}}\n')),
    );
    await expect(async () => {
      for await (const d of client.chat(
        "m",
        [],
        defaults().options,
        new AbortController().signal,
      ))
        void d;
    }).rejects.toThrow("before completion");
  });
  it("propagates cancellation", async () => {
    const c = new AbortController();
    c.abort();
    await expect(async () => {
      for await (const d of lines(stream("hello\n"), c.signal)) void d;
    }).rejects.toThrow();
  });
  it("classifies unauthorized and incompatible providers", async () => {
    const unauthorized = new ProviderClient(
      localProvider,
      async () => new Response("denied", { status: 401 }),
    );
    await expect(unauthorized.models()).rejects.toThrow("Unauthorized");
    const invalid = new ProviderClient(localProvider, async () =>
      Response.json({}),
    );
    await expect(invalid.models()).rejects.toThrow("Incompatible");
  });
});
describe("storage and portability", () => {
  it("persists normal chats across adapter restarts and never persists temporary chat", async () => {
    const name = uid(),
      s = new BrowserStore(name);
    const normal = conversation(),
      temporary = conversation(true);
    await saveConversation(s, normal);
    await saveConversation(s, temporary);
    expect(
      await new BrowserStore(name).get("conversations", normal.id),
    ).toEqual(normal);
    expect(await s.get("conversations", temporary.id)).toBeUndefined();
  });
  it("exports, validates checksum and restores without implicit overwrite", async () => {
    const a = new BrowserStore(uid()),
      b = new BrowserStore(uid());
    const p = starters()[0];
    await a.put("profiles", p);
    const backup = await makeBackup(a, ["profiles"]);
    await validateBackup(backup);
    await b.put("profiles", { ...p, name: "Existing" });
    await restoreBackup(b, backup);
    expect((await b.get<{ name: string }>("profiles", p.id))?.name).toBe(
      "Existing",
    );
    await restoreBackup(b, backup, true);
    expect((await b.get<{ name: string }>("profiles", p.id))?.name).toBe(
      p.name,
    );
    backup.sections.profiles[0].name = "Tampered";
    await expect(validateBackup(backup)).rejects.toThrow("Checksum mismatch");
  });
  it("rejects unknown sections and invalid profile imports", async () => {
    await expect(
      validateBackup({
        schemaVersion: 1,
        createdAt: "now",
        sections: { "../escape": [] },
        checksums: {},
      }),
    ).rejects.toThrow("Unsupported section");
    expect(() =>
      parseProfiles({ schemaVersion: 2, profiles: starters() }),
    ).toThrow();
    expect(() =>
      profileSchema.parse({ ...starters()[0], options: { temperature: 99 } }),
    ).toThrow();
  });
  it("excludes thinking and attachments from standard chat export", () => {
    const c = conversation();
    c.messages = [
      {
        id: uid(),
        role: "assistant",
        createdAt: "now",
        status: "complete",
        parts: [
          { type: "text", text: "answer" },
          { type: "thinking", text: "private-thinking" },
          { type: "image", text: "private-image" },
        ],
      },
    ];
    expect(exportConversation(c, "json")).not.toContain("private-");
  });
});

it("writes mono PCM WAV headers with bounded samples", async () => {
  const { pcmWav } = await import("../src/core/voice");
  const blob = pcmWav(new Float32Array([-2, 0, 2]), 16000);
  const bytes = await blob.arrayBuffer();
  const view = new DataView(bytes);
  expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("RIFF");
  expect(view.getUint32(24, true)).toBe(16000);
  expect(view.getInt16(44, true)).toBe(-32768);
  expect(view.getInt16(48, true)).toBe(32767);
});
it("resolves HF files to revision-specific URLs and rejects traversal", async () => {
  const { resolvedFileUrl } = await import("../src/core/huggingface");
  expect(resolvedFileUrl("owner/repo", "abc", "folder/a b.gguf")).toBe(
    "https://huggingface.co/owner/repo/resolve/abc/folder/a%20b.gguf",
  );
  expect(() => resolvedFileUrl("owner/repo", "main", "../x")).toThrow();
});
it("rejects structured content at the untrusted chat boundary", async () => {
  const client = new ProviderClient(
    localProvider,
    async () =>
      new Response(
        stream('{"message":{"content":{"bad":"object"}},"done":true}\n'),
      ),
  );
  await expect(async () => {
    for await (const d of client.chat(
      "m",
      [],
      defaults().options,
      new AbortController().signal,
    ))
      void d;
  }).rejects.toThrow();
});
it("sanitizes injected credentials out of provider backups", async () => {
  const s = new BrowserStore(uid());
  await s.put("providers", { ...localProvider, apiKey: "must-not-export" });
  expect(JSON.stringify(await makeBackup(s, ["providers"]))).not.toContain(
    "must-not-export",
  );
});
it("initializes once and preserves intentionally emptied providers/profiles", async () => {
  const { initializeStore } = await import("../src/core/bootstrap");
  const s = new BrowserStore(uid());
  await Promise.all([initializeStore(s), initializeStore(s)]);
  expect(await s.list("profiles")).toHaveLength(7);
  for (const p of await s.list<{ id: string }>("profiles"))
    await s.remove("profiles", p.id);
  for (const p of await s.list<{ id: string }>("providers"))
    await s.remove("providers", p.id);
  await initializeStore(s);
  expect(await s.list("profiles")).toHaveLength(0);
  expect(await s.list("providers")).toHaveLength(0);
});
