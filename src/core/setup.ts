import { z } from "zod";
import {
  endpointScope,
  providerSchema,
  uid,
  type Provider,
  type Model,
  type Settings,
  defaults,
} from "./domain";
import { ProviderClient, transferSessionSecret } from "./providers";
import type { Store } from "./storage";
export const setupSchema = z.object({
  schemaVersion: z.literal(1),
  status: z.enum(["complete", "skipped"]),
  completedAt: z.string(),
  providerId: z.string().optional(),
  model: z.string().optional(),
  runtimeOwnership: z.enum(["external", "aether", "remote", "none"]),
  storageRoot: z.string().optional(),
  inferenceTest: z.enum(["passed", "not-run"]),
});
export type SetupRecord = z.infer<typeof setupSchema>;
export type ConnectionResult = {
  provider: Provider;
  status: "connected" | "unreachable" | "unauthorized" | "incompatible";
  models: Model[];
  message: string;
};
export async function probeProvider(
  provider: Provider,
  signal?: AbortSignal,
): Promise<ConnectionResult> {
  try {
    const models = await new ProviderClient(provider).models(signal);
    return {
      provider,
      status: "connected",
      models,
      message: models.length
        ? `Ready · ${models.length} installed model${models.length === 1 ? "" : "s"}`
        : "Connected · no models installed yet",
    };
  } catch (e) {
    if (signal?.aborted) throw e;
    const message = e instanceof Error ? e.message : String(e);
    return {
      provider,
      status: /Unauthorized|401|403/.test(message)
        ? "unauthorized"
        : /Incompatible|Zod|Invalid input/.test(message)
          ? "incompatible"
          : "unreachable",
      models: [],
      message,
    };
  }
}
/** Only well-known loopback endpoints and already-configured local providers; never scan the LAN. */
export async function discoverProviders(
  providers: Provider[],
  signal: AbortSignal,
) {
  const known: Provider[] = [
    {
      id: "detected-ollama",
      name: "Ollama on this device",
      kind: "ollama",
      baseUrl: "http://127.0.0.1:11434",
      enabled: true,
      timeout: 3000,
    },
    {
      id: "detected-lmstudio",
      name: "LM Studio on this device",
      kind: "lmstudio",
      baseUrl: "http://127.0.0.1:1234/v1",
      enabled: true,
      timeout: 3000,
    },
    {
      id: "detected-llamacpp",
      name: "llama.cpp on this device",
      kind: "llamacpp",
      baseUrl: "http://127.0.0.1:8080/v1",
      enabled: true,
      timeout: 3000,
    },
  ];
  const selected = [
    ...providers
      .filter((p) => p.enabled && endpointScope(p.baseUrl) === "local")
      .map((p) => ({ ...p, timeout: 3000 })),
    ...known,
  ];
  const unique = selected.filter(
    (p, i) =>
      selected.findIndex(
        (v) => v.baseUrl.replace(/\/$/, "") === p.baseUrl.replace(/\/$/, ""),
      ) === i,
  );
  return Promise.all(unique.map((p) => probeProvider(p, signal)));
}
export async function completeSetup(
  store: Store,
  input: {
    provider?: Provider;
    model?: string;
    ownership: SetupRecord["runtimeOwnership"];
    storageRoot?: string;
    downloadDirectory?: string;
    tested?: boolean;
    skip?: boolean;
  },
) {
  const settings = (await store.get<Settings>("settings", "app")) ?? defaults();
  let provider = input.provider
    ? providerSchema.parse(input.provider)
    : undefined;
  if (provider) {
    const existing = (await store.list<Provider>("providers")).find(
      (p) =>
        p.baseUrl.replace(/\/$/, "") === provider!.baseUrl.replace(/\/$/, "") &&
        p.kind === provider!.kind,
    );
    provider = {
      ...existing,
      ...provider,
      runtimeOwnership:
        input.ownership === "none" ? undefined : input.ownership,
      id: existing?.id ?? uid(),
      name: existing?.name ?? provider.name,
      timeout: existing?.timeout ?? 120000,
    };
    await store.put("providers", provider);
    if (input.provider) transferSessionSecret(input.provider.id, provider.id);
  }
  const record = setupSchema.parse({
    schemaVersion: 1,
    status: input.skip ? "skipped" : "complete",
    completedAt: new Date().toISOString(),
    providerId: provider?.id,
    model: input.model,
    runtimeOwnership: input.ownership,
    storageRoot: input.storageRoot,
    inferenceTest: input.tested ? "passed" : "not-run",
  });
  await store.put("setup", { ...record, id: "current" });
  await store.put("settings", {
    ...settings,
    id: "app",
    onboarded: true,
    ...(input.downloadDirectory
      ? { modelDirectory: input.downloadDirectory }
      : {}),
  });
  return { record, provider };
}
export const ownershipDescription = (
  ownership: SetupRecord["runtimeOwnership"],
) =>
  ({
    external:
      "Managed outside Aether. Connecting never changes its service, storage or models.",
    aether:
      "Aether-managed child process. Only its private storage and process can be changed here.",
    remote:
      "Remote server. Storage and runtime processes are managed on that server.",
    none: "No inference server selected.",
  })[ownership];
