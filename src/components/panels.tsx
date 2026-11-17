"use client";
import { useEffect, useRef, useState } from "react";
import { Plus, Download, Trash2, Copy, Play, Square } from "lucide-react";
import {
  defaults,
  uid,
  optionsSchema,
  profileSchema,
  providerSchema,
  endpointScope,
  type Provider,
  type Profile,
  type Settings,
  type Options,
  type Model,
  type Benchmark,
  type Metrics,
} from "@/core/domain";
import type { Store } from "@/core/storage";
import { collections } from "@/core/storage";
import { ProviderClient, setSessionSecret } from "@/core/providers";
import {
  download,
  parseProfiles,
  makeBackup,
  validateBackup,
  restoreBackup,
  type Backup,
} from "@/core/portable";
import { ModelImport } from "./model-import";
import { Downloads } from "./downloads";
type Report = { report: (error: string) => void };
export function ProviderPanel({
  store,
  providers,
  onChange,
  report,
}: {
  store: Store;
  providers: Provider[];
  onChange: (p: Provider[]) => void;
} & Report) {
  const [edit, setEdit] = useState<Provider>();
  const [key, setKey] = useState("");
  const [status, setStatus] = useState<Record<string, string>>({});
  return (
    <section className="stack">
      <div className="row spread">
        <div>
          <h1>Providers & servers</h1>
          <p className="muted">
            Choose where inference runs. Remote connections receive your
            messages.
          </p>
        </div>
        <button
          onClick={() =>
            setEdit({
              id: uid(),
              name: "New provider",
              kind: "ollama",
              baseUrl: "http://127.0.0.1:11434",
              enabled: true,
              timeout: 120000,
            })
          }
        >
          <Plus />
          Add connection
        </button>
      </div>
      <div className="grid">
        {providers.map((p) => (
          <article className="card stack" key={p.id}>
            <h2>{p.name}</h2>
            <small>
              {p.kind} · {endpointScope(p.baseUrl)} ·{" "}
              {p.enabled ? "Enabled" : "Disabled"}
            </small>
            <code style={{ overflowWrap: "anywhere" }}>{p.baseUrl}</code>
            <small role="status">{status[p.id] ?? "Not tested"}</small>
            <div className="row">
              <button
                onClick={async () => {
                  setStatus((s) => ({ ...s, [p.id]: "Connecting…" }));
                  try {
                    const ms = await new ProviderClient(p).models();
                    setStatus((s) => ({
                      ...s,
                      [p.id]: `Connected · ${ms.length} models`,
                    }));
                  } catch (e) {
                    setStatus((s) => ({ ...s, [p.id]: String(e) }));
                  }
                }}
              >
                Test connection
              </button>
              <button
                onClick={() => {
                  setEdit({ ...p });
                  setKey("");
                }}
              >
                Edit
              </button>
              <button
                onClick={async () => {
                  const next = { ...p, enabled: !p.enabled };
                  await store.put("providers", next);
                  onChange(providers.map((x) => (x.id === p.id ? next : x)));
                }}
              >
                {p.enabled ? "Disable" : "Enable"}
              </button>
              <button
                className="danger"
                onClick={async () => {
                  if (
                    confirm(
                      "Remove this connection? Conversations will retain their original provider reference.",
                    )
                  ) {
                    await store.remove("providers", p.id);
                    setSessionSecret(p.id, "");
                    onChange(providers.filter((x) => x.id !== p.id));
                  }
                }}
              >
                <Trash2 />
                Remove
              </button>
            </div>
          </article>
        ))}
      </div>
      {edit && (
        <div
          className="modal"
          role="dialog"
          aria-modal="true"
          aria-label="Edit provider"
        >
          <form
            className="card stack"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const p = providerSchema.parse(edit);
                await store.put("providers", p);
                setSessionSecret(p.id, key);
                onChange([...providers.filter((x) => x.id !== p.id), p]);
                setKey("");
                setEdit(undefined);
              } catch (e) {
                report(String(e));
              }
            }}
          >
            <h2>Connection details</h2>
            <label>
              Label
              <input
                value={edit.name}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                required
              />
            </label>
            <label>
              API protocol
              <select
                value={edit.kind}
                onChange={(e) =>
                  setEdit({
                    ...edit,
                    kind: e.target.value as Provider["kind"],
                    baseUrl:
                      e.target.value === "ollama"
                        ? "http://127.0.0.1:11434"
                        : "http://127.0.0.1:1234/v1",
                  })
                }
              >
                <option value="ollama">Ollama (local or remote)</option>
                <option value="openai">OpenAI-compatible</option>
                <option value="llamacpp">llama.cpp (OpenAI API)</option>
                <option value="lmstudio">LM Studio (OpenAI API)</option>
              </select>
            </label>
            <label>
              Base URL (include /v1 for compatible APIs)
              <input
                type="url"
                value={edit.baseUrl}
                onChange={(e) => setEdit({ ...edit, baseUrl: e.target.value })}
                required
              />
            </label>
            <label>
              Request timeout (ms)
              <input
                type="number"
                min={1000}
                max={600000}
                value={edit.timeout}
                onChange={(e) =>
                  setEdit({ ...edit, timeout: Number(e.target.value) })
                }
              />
            </label>
            <label>
              API key · session only
              <input
                type="password"
                value={key}
                autoComplete="off"
                onChange={(e) => setKey(e.target.value)}
              />
            </label>
            <small>
              Keys are kept in memory until reload and excluded from storage and
              backups. Saving an empty key clears this connection’s session key.
              Native OS keychain integration is not yet available.
            </small>
            <div className="row">
              <button className="primary" type="submit">
                Save connection
              </button>
              <button
                type="button"
                onClick={() => {
                  setEdit(undefined);
                  setKey("");
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
function OptionsEditor({
  options,
  onChange,
}: {
  options: Options;
  onChange: (o: Options) => void;
}) {
  return (
    <div className="grid">
      {Object.entries(options)
        .filter(([key]) => key !== "stop")
        .map(([key, value]) => (
          <label key={key}>
            {key}
            <input
              type="number"
              step={["num_ctx", "top_k", "seed"].includes(key) ? 1 : 0.05}
              value={String(value)}
              onChange={(e) => {
                if (e.target.value !== "")
                  onChange({ ...options, [key]: Number(e.target.value) });
              }}
            />
          </label>
        ))}
      <label>
        Stop sequences (one per line)
        <textarea
          value={options.stop.join("\n")}
          onChange={(e) =>
            onChange({
              ...options,
              stop: e.target.value.split("\n").filter(Boolean),
            })
          }
        />
      </label>
    </div>
  );
}
export function ProfilePanel({
  store,
  profiles,
  onChange,
  providers,
  report,
}: {
  store: Store;
  profiles: Profile[];
  onChange: (p: Profile[]) => void;
  providers: Provider[];
} & Report) {
  const [edit, setEdit] = useState<Profile>();
  return (
    <section className="stack">
      <div className="row spread">
        <h1>AI Profiles</h1>
        <button
          onClick={() =>
            setEdit({
              id: uid(),
              name: "New profile",
              description: "",
              systemPrompt: "",
              outputStyle: "",
              capabilities: [],
              options: optionsSchema.parse({}),
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            })
          }
        >
          <Plus />
          Create profile
        </button>
        <button
          onClick={() =>
            download(
              "profiles.json",
              JSON.stringify({ schemaVersion: 1, profiles }, null, 2),
            )
          }
        >
          <Download />
          Export all
        </button>
      </div>
      <label>
        Import versioned profiles
        <input
          type="file"
          accept="application/json"
          onChange={async (e) => {
            try {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 2e6) throw new Error("Profile file too large");
              const imported = parseProfiles(JSON.parse(await file.text())).map(
                (p) => ({ ...p, id: uid() }),
              );
              for (const p of imported) await store.put("profiles", p);
              onChange([...profiles, ...imported]);
            } catch (e) {
              report(String(e));
            }
          }}
        />
      </label>
      <div className="grid">
        {profiles.map((p) => (
          <article className="card stack" key={p.id}>
            <h2>{p.name}</h2>
            <p className="muted">{p.description}</p>
            <small>
              {p.model || "Use current model"} ·{" "}
              {p.capabilities.join(", ") || "Text"}
            </small>
            <div className="row">
              <button onClick={() => setEdit(structuredClone(p))}>Edit</button>
              <button
                onClick={async () => {
                  const next = { ...p, id: uid(), name: `${p.name} copy` };
                  await store.put("profiles", next);
                  onChange([...profiles, next]);
                }}
              >
                <Copy />
                Duplicate
              </button>
              <button
                onClick={() =>
                  download(
                    "profile.json",
                    JSON.stringify(
                      { schemaVersion: 1, profiles: [p] },
                      null,
                      2,
                    ),
                  )
                }
              >
                <Download />
                Export
              </button>
              <button
                className="danger"
                onClick={async () => {
                  if (confirm(`Delete ${p.name}?`)) {
                    await store.remove("profiles", p.id);
                    onChange(profiles.filter((x) => x.id !== p.id));
                  }
                }}
              >
                <Trash2 />
                Delete
              </button>
            </div>
          </article>
        ))}
      </div>
      {edit && (
        <div
          className="modal"
          role="dialog"
          aria-modal="true"
          aria-label="Edit AI Profile"
        >
          <form
            className="card stack"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const p = profileSchema.parse({
                  ...edit,
                  updatedAt: new Date().toISOString(),
                });
                await store.put("profiles", p);
                onChange([...profiles.filter((x) => x.id !== p.id), p]);
                setEdit(undefined);
              } catch (e) {
                report(String(e));
              }
            }}
          >
            <h2>Edit AI Profile</h2>
            <label>
              Name
              <input
                value={edit.name}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
              />
            </label>
            <label>
              Description
              <input
                value={edit.description}
                onChange={(e) =>
                  setEdit({ ...edit, description: e.target.value })
                }
              />
            </label>
            <label>
              System instructions
              <textarea
                value={edit.systemPrompt}
                onChange={(e) =>
                  setEdit({ ...edit, systemPrompt: e.target.value })
                }
              />
            </label>
            <label>
              Output style
              <input
                value={edit.outputStyle}
                onChange={(e) =>
                  setEdit({ ...edit, outputStyle: e.target.value })
                }
              />
            </label>
            <label>
              Bind provider
              <select
                value={edit.providerId ?? ""}
                onChange={(e) =>
                  setEdit({ ...edit, providerId: e.target.value || undefined })
                }
              >
                <option value="">Use current provider</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Bind exact model identifier (empty uses current)
              <input
                value={edit.model ?? ""}
                onChange={(e) =>
                  setEdit({ ...edit, model: e.target.value || undefined })
                }
              />
            </label>
            <div className="row">
              {(["vision", "tools", "audio", "web"] as const).map((c) => (
                <label className="switch" key={c}>
                  <input
                    type="checkbox"
                    checked={edit.capabilities.includes(c)}
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        capabilities: e.target.checked
                          ? [...edit.capabilities, c]
                          : edit.capabilities.filter((x) => x !== c),
                      })
                    }
                  />
                  Requires {c}
                </label>
              ))}
            </div>
            <OptionsEditor
              options={edit.options}
              onChange={(options) => setEdit({ ...edit, options })}
            />
            <div className="row">
              <button className="primary" type="submit">
                Save profile
              </button>
              <button type="button" onClick={() => setEdit(undefined)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
export function SettingsPanel({
  settings,
  save,
}: {
  settings: Settings;
  save: (s: Settings) => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [local, setLocal] = useState(settings);
  const [message, setMessage] = useState("");
  return (
    <section className="stack">
      <h1>Settings</h1>
      <input
        aria-label="Search settings"
        placeholder="Search settings"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {"appearance theme density font chat width motion transparency contrast".includes(
        search.toLowerCase(),
      ) && (
        <section className="card stack">
          <h2>Appearance</h2>
          <div className="grid">
            <label>
              Theme
              <select
                value={local.theme}
                onChange={(e) =>
                  setLocal({
                    ...local,
                    theme: e.target.value as Settings["theme"],
                  })
                }
              >
                {["dark", "light", "system"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label>
              Density
              <select
                value={local.density}
                onChange={(e) =>
                  setLocal({
                    ...local,
                    density: e.target.value as Settings["density"],
                  })
                }
              >
                <option>comfortable</option>
                <option>compact</option>
              </select>
            </label>
            <label>
              Font size
              <input
                type="number"
                min={12}
                max={24}
                value={local.fontSize}
                onChange={(e) =>
                  setLocal({ ...local, fontSize: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Chat width
              <input
                type="number"
                min={480}
                max={1400}
                value={local.chatWidth}
                onChange={(e) =>
                  setLocal({ ...local, chatWidth: Number(e.target.value) })
                }
              />
            </label>
          </div>
          {(
            ["reducedMotion", "solid", "contrast", "showThinking"] as const
          ).map((k) => (
            <label className="switch" key={k}>
              <input
                type="checkbox"
                checked={local[k]}
                onChange={(e) => setLocal({ ...local, [k]: e.target.checked })}
              />
              {
                {
                  reducedMotion: "Reduce motion",
                  solid: "Solid surfaces",
                  contrast: "High contrast",
                  showThinking: "Expand provider thinking",
                }[k]
              }
            </label>
          ))}
        </section>
      )}
      {"inference temperature context seed keep alive thinking chat".includes(
        search.toLowerCase(),
      ) && (
        <section className="card stack">
          <h2>App inference defaults</h2>
          <p className="muted">
            Profiles override these defaults. Ollama supports all listed
            options. Compatible APIs receive temperature, top-p, seed and stop
            sequences; other controls are not forwarded. Changes do not modify
            model files.
          </p>
          <OptionsEditor
            options={local.options}
            onChange={(options) => setLocal({ ...local, options })}
          />
          <label>
            Ollama keep-alive
            <input
              value={local.keepAlive}
              onChange={(e) =>
                setLocal({ ...local, keepAlive: e.target.value })
              }
            />
          </label>
          <label>
            Ollama thinking
            <select
              value={local.think}
              onChange={(e) =>
                setLocal({
                  ...local,
                  think: e.target.value as Settings["think"],
                })
              }
            >
              <option value="default">Model default</option>
              <option value="on">On (requires model support)</option>
              <option value="off">Off (requires model support)</option>
            </select>
          </label>
        </section>
      )}
      <div className="row">
        <button
          className="primary"
          onClick={async () => {
            try {
              const { settingsSchema } = await import("@/core/domain");
              await save(settingsSchema.parse(local));
              setMessage("Settings saved locally");
            } catch (e) {
              setMessage(String(e));
            }
          }}
        >
          Save settings
        </button>
        <button
          onClick={() => {
            if (
              confirm(
                "Reset settings? Conversations, profiles and providers will be preserved.",
              )
            ) {
              const next = { ...defaults(), onboarded: true };
              setLocal(next);
              void save(next);
            }
          }}
        >
          Reset settings
        </button>
        <small role="status">{message}</small>
      </div>
    </section>
  );
}
export function BackupPanel({ store, report }: { store: Store } & Report) {
  const [selected, setSelected] = useState<string[]>([...collections]);
  const [backup, setBackup] = useState<Backup>();
  const [conflicts, setConflicts] = useState(0);
  const [overwrite, setOverwrite] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <section className="stack">
      <h1>Backup & restore</h1>
      <div className="notice">
        Portable JSON records with SHA-256 section checksums. Credentials and
        model weights are excluded. Chat attachment content currently travels
        with its conversation; uncheck conversations to exclude it. Backups are
        unencrypted—store them securely.
      </div>
      <section className="card stack">
        <h2>Select categories</h2>
        <div className="grid">
          {collections.map((c) => (
            <label className="switch" key={c}>
              <input
                type="checkbox"
                checked={selected.includes(c)}
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? [...selected, c]
                      : selected.filter((x) => x !== c),
                  )
                }
              />
              {c}
            </label>
          ))}
        </div>
        <button
          disabled={!selected.length}
          onClick={async () => {
            try {
              download(
                "aether.backup.json",
                JSON.stringify(await makeBackup(store, selected), null, 2),
              );
            } catch (e) {
              report(String(e));
            }
          }}
        >
          <Download />
          Export selected categories
        </button>
      </section>
      <section className="card stack">
        <h2>Restore preview</h2>
        <input
          aria-label="Select backup"
          type="file"
          accept="application/json"
          onChange={async (e) => {
            try {
              setBackup(undefined);
              const f = e.target.files?.[0];
              if (!f) return;
              if (f.size > 50e6) throw new Error("Backup exceeds 50 MB limit");
              const b = await validateBackup(JSON.parse(await f.text()));
              let count = 0;
              for (const [c, records] of Object.entries(b.sections))
                for (const r of records) if (await store.get(c, r.id)) count++;
              setConflicts(count);
              setBackup(b);
            } catch (e) {
              report(String(e));
            }
          }}
        />
        {backup && (
          <>
            <p>
              {Object.entries(backup.sections)
                .map(([k, v]) => `${k}: ${v.length}`)
                .join(" · ")}
            </p>
            <p>
              {conflicts} existing IDs conflict. Restore only checked
              categories.
            </p>
            <label className="switch">
              <input
                type="checkbox"
                checked={overwrite}
                onChange={(e) => setOverwrite(e.target.checked)}
              />
              Overwrite conflicting records (otherwise skip)
            </label>
            <button
              onClick={async () => {
                if (
                  !confirm(
                    `Restore selected records${overwrite ? " and overwrite conflicts" : ""}?`,
                  )
                )
                  return;
                try {
                  await restoreBackup(store, backup, overwrite, selected);
                  setMessage(
                    "Restore complete. Reload the app to load restored records.",
                  );
                  setBackup(undefined);
                } catch (e) {
                  report(String(e));
                }
              }}
            >
              Restore selected records
            </button>
          </>
        )}
        <p role="status">{message}</p>
      </section>
    </section>
  );
}
export function BenchmarkPanel({
  store,
  provider,
  model,
  settings,
  report,
}: {
  store: Store;
  provider?: Provider;
  model: string;
  settings: Settings;
} & Report) {
  const [runs, setRuns] = useState<Benchmark[]>([]);
  const [prompt, setPrompt] = useState(
    "Explain how a hash table works in 150 words.",
  );
  const [warm, setWarm] = useState(false);
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => {
    store
      .list<Benchmark>("benchmarks")
      .then(setRuns)
      .catch((e) => report(String(e)));
    return () => abort.current?.abort();
  }, [store, report]);
  async function run() {
    if (!provider || !model) return;
    setBusy(true);
    const controller = new AbortController();
    abort.current = controller;
    const client = new ProviderClient(provider);
    let metrics: Metrics = {};
    let error: string | undefined;
    const messages = [
      {
        id: uid(),
        role: "user" as const,
        parts: [{ type: "text" as const, text: prompt }],
        status: "complete" as const,
        createdAt: new Date().toISOString(),
      },
    ];
    try {
      if (warm)
        for await (const ignored of client.chat(
          model,
          [{ ...messages[0], parts: [{ type: "text", text: "Say ready." }] }],
          settings.options,
          controller.signal,
        )) {
          void ignored;
        }
      for await (const d of client.chat(
        model,
        messages,
        settings.options,
        controller.signal,
      ))
        if (d.metrics) metrics = { ...metrics, ...d.metrics };
    } catch (e) {
      error = String(e);
    }
    const result: Benchmark = {
      id: uid(),
      createdAt: new Date().toISOString(),
      provider,
      model,
      options: settings.options,
      prompt,
      suiteVersion: 1,
      mode: warm ? "warm" : "as-is",
      metrics,
      error,
    };
    try {
      await store.put("benchmarks", result);
      setRuns((r) => [result, ...r]);
    } catch (e) {
      report(String(e));
    }
    setBusy(false);
  }
  return (
    <section className="stack">
      <h1>Benchmarks</h1>
      <p className="muted">
        Run against the provider and model selected in Chat. Throughput uses
        provider token counts and durations. TTFT and total duration use the
        client clock. Hardware telemetry is unavailable in browser preview. No
        quality score is inferred.
      </p>
      <section className="card stack">
        <p>
          {provider?.name ?? "Select provider"} · {model || "Select model"}
        </p>
        <label>
          Suite v1 / custom prompt
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </label>
        <label className="switch">
          <input
            type="checkbox"
            checked={warm}
            onChange={(e) => setWarm(e.target.checked)}
          />
          Warm up before measuring (otherwise current runtime state; not
          guaranteed cold)
        </label>
        {busy ? (
          <button onClick={() => abort.current?.abort()}>
            <Square />
            Cancel benchmark
          </button>
        ) : (
          <button
            disabled={!model || !provider || !prompt.trim()}
            onClick={() => void run()}
          >
            <Play />
            Run benchmark
          </button>
        )}
      </section>
      <button
        onClick={() =>
          download("benchmarks.json", JSON.stringify(runs, null, 2))
        }
      >
        <Download />
        Export history
      </button>
      {runs.map((r) => (
        <article className="card" key={r.id}>
          <h2>{r.model}</h2>
          <small>
            {r.createdAt} · {r.mode} · suite {r.suiteVersion} · context{" "}
            {r.options.num_ctx}
          </small>
          {r.error && <p className="error">{r.error}</p>}
          <dl className="grid">
            {[
              ["First token", r.metrics.ttftMs, "ms"],
              ["Total", r.metrics.totalMs, "ms"],
              ["Output rate", r.metrics.outputPerSecond, "tok/s"],
              ["Prompt rate", r.metrics.promptPerSecond, "tok/s"],
              ["Output tokens", r.metrics.outputTokens, "tokens"],
              ["Load", r.metrics.loadMs, "ms"],
            ].map(([label, v, unit]) => (
              <div key={String(label)}>
                <dt className="muted">{label}</dt>
                <dd>
                  {typeof v === "number"
                    ? `${v.toFixed(2)} ${unit}`
                    : "Not supplied"}
                </dd>
              </div>
            ))}
          </dl>
          <details>
            <summary>Exact configuration</summary>
            <pre>{JSON.stringify(r.options, null, 2)}</pre>
            <p>{r.provider.baseUrl}</p>
            <p>{r.prompt}</p>
          </details>
        </article>
      ))}
    </section>
  );
}
export function ModelsPanel({
  provider,
  downloadDirectory,
  models,
  refresh,
  report,
}: {
  provider?: Provider;
  downloadDirectory?: string;
  models: Model[];
  refresh: () => Promise<void>;
} & Report) {
  const [pull, setPull] = useState("");
  const [progress, setProgress] = useState("");
  const [busy, setBusy] = useState(false);
  const [details, setDetails] = useState<unknown>();
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  return (
    <section className="stack">
      <div className="row spread">
        <h1>Model inventory</h1>
        <button onClick={() => void refresh()}>Refresh inventory</button>
      </div>
      <p className="muted">
        {provider?.name} · {provider?.baseUrl}.{" "}
        {provider && endpointScope(provider.baseUrl) === "local"
          ? "Local provider registrations"
          : "Remote provider models"}
        . Runtime-managed weights are separate from original GGUF sources. This
        application never edits Ollama’s internal blobs.
      </p>
      {provider?.kind === "ollama" && (
        <section className="card stack">
          <h2>Pull from Ollama registry</h2>
          <p className="muted">
            Explicit network operation performed by your Ollama server, using
            its configured model store. Large downloads can consume significant
            disk space. Cancellation stops this request; the runtime controls
            partial-data reuse.
          </p>
          <label>
            Exact model name
            <input
              value={pull}
              onChange={(e) => setPull(e.target.value)}
              placeholder="Model name from the Ollama registry"
            />
          </label>
          {busy ? (
            <button onClick={() => abort.current?.abort()}>
              Cancel request
            </button>
          ) : (
            <button
              disabled={!pull.trim()}
              onClick={async () => {
                if (
                  !confirm(
                    `Ask ${provider.baseUrl} to download ${pull}? This may use multiple GB in the server's model directory.`,
                  )
                )
                  return;
                setBusy(true);
                const c = new AbortController();
                abort.current = c;
                try {
                  for await (const d of new ProviderClient(provider).pull(
                    pull,
                    c.signal,
                  ))
                    setProgress(
                      `${d.status}${d.total ? ` · ${(((d.completed ?? 0) / d.total) * 100).toFixed(1)}%` : ""}`,
                    );
                  await refresh();
                } catch (e) {
                  setProgress(String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Download via provider
            </button>
          )}
          <p role="status">{progress}</p>
          <button
            onClick={async () => {
              try {
                setDetails(await new ProviderClient(provider).loaded());
              } catch (e) {
                report(String(e));
              }
            }}
          >
            Inspect loaded models
          </button>
        </section>
      )}
      <ModelImport provider={provider} refresh={refresh} />
      <Downloads preferredDirectory={downloadDirectory} />
      {models.length === 0 && (
        <div className="notice">
          No models returned. Test the selected provider in Providers, then
          refresh here.
        </div>
      )}
      <div className="grid">
        {models.map((m) => (
          <article className="card stack" key={m.id}>
            <h2>{m.id}</h2>
            <small>
              {m.size
                ? `${(m.size / 1e9).toFixed(2)} GB runtime size`
                : "Size not exposed by provider"}
            </small>
            {m.size && (
              <small>
                Estimated loading memory lower bound:{" "}
                {(m.size / 1e9).toFixed(1)} GB weights, plus context and runtime
                overhead. This is not a RAM/VRAM fit guarantee.
              </small>
            )}
            <button
              onClick={async () => {
                if (provider)
                  try {
                    setDetails(await new ProviderClient(provider).show(m.id));
                  } catch (e) {
                    report(String(e));
                  }
              }}
            >
              Inspect metadata & capabilities
            </button>
            {provider?.kind === "ollama" && (
              <button
                className="danger"
                onClick={async () => {
                  if (
                    confirm(
                      `Remove runtime-managed model ${m.id} from ${provider.baseUrl}? Ollama manages shared weights; original GGUF sources are not deleted.`,
                    )
                  ) {
                    try {
                      await new ProviderClient(provider).removeModel(m.id);
                      await refresh();
                    } catch (e) {
                      report(String(e));
                    }
                  }
                }}
              >
                <Trash2 />
                Remove runtime model
              </button>
            )}
          </article>
        ))}
      </div>
      {details !== undefined && (
        <section className="card">
          <div className="row spread">
            <h2>Provider metadata</h2>
            <button onClick={() => setDetails(undefined)}>Close</button>
          </div>
          <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {JSON.stringify(details, null, 2)}
          </pre>
        </section>
      )}
    </section>
  );
}
