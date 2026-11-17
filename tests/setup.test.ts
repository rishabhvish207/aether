import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach } from "vitest";
import { BrowserStore } from "../src/core/storage";
import { defaults, localProvider, uid, starters } from "../src/core/domain";
import {
  completeSetup,
  discoverProviders,
  probeProvider,
} from "../src/core/setup";
import { makeBackup, restoreBackup } from "../src/core/portable";
afterEach(() => vi.unstubAllGlobals());
describe("adaptive setup", () => {
  it("accepts existing empty model libraries without calling mutation endpoints", async () => {
    const paths: string[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      paths.push(new URL(url).pathname);
      expect(init.method).toBe("GET");
      return Response.json({ models: [] });
    });
    const result = await probeProvider(localProvider);
    expect(result.status).toBe("connected");
    expect(result.models).toEqual([]);
    expect(paths).toEqual(["/api/tags"]);
  });
  it("preserves user records and provider identity when completing or reopening setup", async () => {
    const s = new BrowserStore(uid());
    const original = {
      ...defaults(),
      onboarded: true,
      theme: "light" as const,
      fontSize: 19,
      modelDirectory: "/user/original-downloads",
    };
    await s.put("settings", { ...original, id: "app" });
    await s.put("providers", {
      ...localProvider,
      name: "My existing setup",
      timeout: 45000,
    });
    const profile = starters()[0];
    await s.put("profiles", profile);
    await s.put("conversations", { id: "history", private: "preserve me" });
    const result = await completeSetup(s, {
      provider: { ...localProvider, id: "detected", name: "Discovered" },
      model: "existing",
      ownership: "external",
    });
    expect(result.provider?.id).toBe(localProvider.id);
    expect(result.provider?.name).toBe("My existing setup");
    expect(result.provider?.runtimeOwnership).toBe("external");
    expect(await s.list("providers")).toHaveLength(1);
    expect(await s.get("profiles", profile.id)).toEqual(profile);
    expect(await s.get("conversations", "history")).toEqual({
      id: "history",
      private: "preserve me",
    });
    expect(await s.get("settings", "app")).toEqual({ ...original, id: "app" });
    expect((await s.get<{ status: string }>("setup", "current"))?.status).toBe(
      "complete",
    );
  });
  it("discovery deduplicates local endpoints and never scans remote or LAN providers", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      urls.push(url);
      return Response.json(
        url.includes("/api/tags")
          ? { models: [{ name: "existing" }] }
          : { data: [] },
      );
    });
    const abort = new AbortController();
    const results = await discoverProviders(
      [
        localProvider,
        {
          ...localProvider,
          id: "remote",
          baseUrl: "https://private.example.com",
        },
        { ...localProvider, id: "lan", baseUrl: "http://192.168.1.10:11434" },
      ],
      abort.signal,
    );
    expect(urls).toHaveLength(3);
    expect(urls.every((u) => new URL(u).hostname === "127.0.0.1")).toBe(true);
    expect(results[0].models[0].id).toBe("existing");
  });
  it("reports authorization, disconnected and incompatible services truthfully", async () => {
    for (const [fetcher, status] of [
      [async () => new Response("denied", { status: 401 }), "unauthorized"],
      [
        async () => {
          throw new Error("offline");
        },
        "unreachable",
      ],
      [async () => Response.json({ unexpected: true }), "incompatible"],
    ] as const) {
      vi.stubGlobal("fetch", fetcher);
      expect((await probeProvider(localProvider)).status).toBe(status);
    }
  });
  it("records skip without destroying provider records or pretending inference succeeded", async () => {
    const s = new BrowserStore(uid());
    await s.put("providers", localProvider);
    const result = await completeSetup(s, { ownership: "none", skip: true });
    expect(result.record.inferenceTest).toBe("not-run");
    expect(result.record.status).toBe("skipped");
    expect(await s.list("providers")).toEqual([localProvider]);
    expect(
      (await s.get<{ onboarded: boolean }>("settings", "app"))?.onboarded,
    ).toBe(true);
  });
  it("keeps setup ownership/preferences portable without secrets", async () => {
    const s = new BrowserStore(uid());
    await completeSetup(s, {
      provider: { ...localProvider, id: "managed" },
      ownership: "aether",
      storageRoot: "/separate/aether-data",
      downloadDirectory: "/separate/aether-data/downloads",
    });
    const backup = await makeBackup(s, ["setup", "providers", "settings"]);
    const other = new BrowserStore(uid());
    await restoreBackup(other, backup);
    expect(
      (await other.get<{ runtimeOwnership: string }>("setup", "current"))
        ?.runtimeOwnership,
    ).toBe("aether");
    expect(
      (await other.get<{ modelDirectory: string }>("settings", "app"))
        ?.modelDirectory,
    ).toBe("/separate/aether-data/downloads");
  });
});
it("preserves a session-only key when setup binds to a saved provider ID", async () => {
  const { setSessionSecret, ProviderClient } =
    await import("../src/core/providers");
  const s = new BrowserStore(uid());
  const endpoint = "https://example.test/v1";
  await s.put("providers", {
    ...localProvider,
    id: "saved-auth",
    kind: "openai",
    baseUrl: endpoint,
  });
  setSessionSecret("candidate-auth", "test-only-not-a-secret");
  const result = await completeSetup(s, {
    provider: {
      ...localProvider,
      id: "candidate-auth",
      kind: "openai",
      baseUrl: endpoint,
    },
    ownership: "remote",
  });
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer test-only-not-a-secret",
    );
    return Response.json({ data: [] });
  });
  await new ProviderClient(result.provider!).models();
  expect(
    JSON.stringify(await makeBackup(s, ["setup", "providers"])),
  ).not.toContain("test-only-not-a-secret");
  setSessionSecret("saved-auth", "");
});
