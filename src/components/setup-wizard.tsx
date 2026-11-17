"use client";
import { confirmAction } from "@/core/consent";
import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  ArrowLeft,
  Server,
  HardDrive,
  Cloud,
  RefreshCw,
} from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import {
  brand,
  type Provider,
  type Model,
  uid,
  defaults,
  endpointScope,
  providerSchema,
  type Message,
} from "@/core/domain";
import { type Store } from "@/core/storage";
import {
  discoverProviders,
  probeProvider,
  completeSetup,
  ownershipDescription,
  type ConnectionResult,
  type SetupRecord,
} from "@/core/setup";
import { isNative } from "@/core/native";
import {
  setupNative,
  type RuntimeEnvironment,
  type StorageLayout,
  type RuntimeRelease,
} from "@/core/setup-native";
import { ProviderClient, setSessionSecret } from "@/core/providers";
import { StorageLocation } from "./storage-location";
type Completion = Awaited<ReturnType<typeof completeSetup>>;
export function SetupWizard({
  store,
  providers,
  onDone,
  onClose,
}: {
  store: Store;
  providers: Provider[];
  onDone: (result: Completion) => Promise<void>;
  onClose?: () => void;
}) {
  const [step, setStep] = useState<
    "welcome" | "discover" | "custom" | "local" | "models" | "finish"
  >("welcome");
  const [found, setFound] = useState<ConnectionResult[]>([]);
  const [selected, setSelected] = useState<Provider>();
  const [models, setModels] = useState<Model[]>([]);
  const [model, setModel] = useState("");
  const [ownership, setOwnership] =
    useState<SetupRecord["runtimeOwnership"]>("external");
  const [env, setEnv] = useState<RuntimeEnvironment>();
  const [layout, setLayout] = useState<StorageLayout>();
  const [release, setRelease] = useState<RuntimeRelease>();
  const [installed, setInstalled] = useState(false);
  const [starterModels, setStarterModels] = useState<
    { name: string; bytes: number; source: string }[]
  >([]);
  const [modelBytes, setModelBytes] = useState<number>();
  const [useBinary, setUseBinary] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [tested, setTested] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [pullName, setPullName] = useState("");
  const [custom, setCustom] = useState<Provider>({
    id: uid(),
    name: "My AI server",
    kind: "ollama",
    baseUrl: "http://127.0.0.1:11434",
    enabled: true,
    timeout: 30000,
  });
  const abort = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!isNative()) return;
    setupNative
      .environment()
      .then((result) => {
        setEnv(result);
        setUseBinary(!!result.existing.binary);
      })
      .catch((e) => setError(String(e)));
    const pending = listen<{
      phase: string;
      downloaded: number;
      total: number;
    }>("runtime-install-progress", (e) =>
      setStatus(
        `${e.payload.phase} · ${(e.payload.downloaded / 1e6).toFixed(1)} / ${(e.payload.total / 1e6).toFixed(1)} MB`,
      ),
    );
    return () => {
      abort.current?.abort();
      void pending.then((unlisten) => unlisten());
    };
  }, []);
  async function action(task: (signal: AbortSignal) => Promise<void>) {
    setBusy(true);
    setError("");
    setStatus("Working…");
    const c = new AbortController();
    abort.current = c;
    try {
      await task(c.signal);
    } catch (e) {
      setError(String(e));
      setStatus(
        "Action did not complete. Your existing configuration was preserved.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function connect(
    provider: Provider,
    signal: AbortSignal,
    owner: SetupRecord["runtimeOwnership"] = provider.runtimeOwnership ??
      (endpointScope(provider.baseUrl) === "local" ? "external" : "remote"),
  ) {
    const result = await probeProvider(provider, signal);
    if (result.status !== "connected") throw new Error(result.message);
    setSelected(provider);
    setModels(result.models);
    setModel(result.models[0]?.id ?? "");
    setOwnership(owner);
    setTested(false);
    setStatus(result.message);
    setStep("models");
  }
  async function finish(skip = false) {
    await action(async () => {
      const result = await completeSetup(store, {
        provider: skip ? undefined : selected,
        model: skip ? undefined : model,
        ownership: skip ? "none" : ownership,
        storageRoot: layout?.root,
        downloadDirectory: layout?.downloads,
        tested,
        skip,
      });
      await onDone(result);
    });
  }
  const canInstall = !!env?.automaticInstall;
  return (
    <section className="setup-shell stack">
      <div className="row spread">
        <span className="eyebrow">{brand.name} · Set up your workspace</span>
        {onClose && (
          <button disabled={busy} onClick={onClose}>
            Close setup
          </button>
        )}
      </div>
      <div className="row" aria-label="Setup progress">
        {["Connect", "Model", "Ready"].map((label, i) => (
          <span className="chip" key={label}>
            {(step === "finish" ? 2 : step === "models" ? 1 : 0) > i ? (
              <CheckCircle2 size={13} />
            ) : (
              i + 1
            )}{" "}
            {label}
          </span>
        ))}
      </div>
      {step === "welcome" && (
        <>
          <h1>Local AI, made simple.</h1>
          <p className="muted">
            Connect to what you already have, or let Aether prepare a private
            local workspace. Your chats and settings stay on this device. No
            software or large models will be installed without your approval.
          </p>
          <div className="grid">
            <button
              className="setup-choice"
              onClick={() => {
                setStep("discover");
                void action(async (signal) => {
                  setFound(await discoverProviders(providers, signal));
                  setStatus(
                    "Local checks complete. Choose a connection or enter an address.",
                  );
                });
              }}
            >
              <Server />
              <strong>Use an existing setup</strong>
              <span>
                Find supported local AI services. Keep their models and settings
                exactly as they are.
              </span>
            </button>
            <button className="setup-choice" onClick={() => setStep("local")}>
              <HardDrive />
              <strong>Set up AI on this device</strong>
              <span>
                Choose storage, review changes, and approve an isolated runtime.
              </span>
            </button>
            <button className="setup-choice" onClick={() => setStep("custom")}>
              <Cloud />
              <strong>Connect a server</strong>
              <span>
                Use another runtime, a network computer, or a remote provider.
              </span>
            </button>
          </div>
          <button disabled={busy} onClick={() => void finish(true)}>
            Skip setup for now
          </button>
        </>
      )}
      {step === "discover" && (
        <>
          <h1>What Aether found</h1>
          <p>
            Only supported addresses on this device were checked. No service was
            changed. Zero installed models means the connection is valid and you
            can choose a model next.
          </p>
          {found.map((f) => (
            <section className="card stack" key={f.provider.baseUrl}>
              <h2>{f.provider.name}</h2>
              <small>{f.provider.baseUrl}</small>
              <p role="status">{f.message}</p>
              {f.status === "connected" && (
                <button
                  disabled={busy}
                  className="primary"
                  onClick={() => void action((s) => connect(f.provider, s))}
                >
                  Use this connection
                </button>
              )}
            </section>
          ))}
          <button disabled={busy} onClick={() => setStep("custom")}>
            Enter a server address instead
          </button>
        </>
      )}
      {step === "custom" && (
        <>
          <h1>Connect your AI server</h1>
          <p>
            Messages will be sent to the exact address below. Aether cannot
            change remote model storage or install software on that server.
          </p>
          <label>
            Connection name
            <input
              disabled={busy}
              value={custom.name}
              onChange={(e) => setCustom({ ...custom, name: e.target.value })}
            />
          </label>
          <label>
            Server type
            <select
              disabled={busy}
              value={custom.kind}
              onChange={(e) =>
                setCustom({
                  ...custom,
                  kind: e.target.value as Provider["kind"],
                  baseUrl:
                    e.target.value === "ollama"
                      ? "http://127.0.0.1:11434"
                      : "http://127.0.0.1:1234/v1",
                })
              }
            >
              <option value="ollama">Ollama</option>
              <option value="lmstudio">LM Studio</option>
              <option value="llamacpp">llama.cpp</option>
              <option value="openai">OpenAI-compatible</option>
            </select>
          </label>
          <label>
            Server address
            <input
              type="url"
              disabled={busy}
              value={custom.baseUrl}
              onChange={(e) =>
                setCustom({ ...custom, baseUrl: e.target.value })
              }
            />
          </label>
          <label>
            API key (optional, this session only)
            <input
              type="password"
              autoComplete="off"
              value={apiKey}
              disabled={busy}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </label>
          <small>
            Compatible servers usually include /v1. For authenticated endpoints,
            save a session key in Providers after setup; keys are never stored
            in setup records.
          </small>
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              void action((s) => {
                setSessionSecret(custom.id, apiKey);
                return connect(providerSchema.parse(custom), s);
              })
            }
          >
            Test and connect
          </button>
          {providers.length > 0 && (
            <details>
              <summary>Saved connections</summary>
              {providers.map((p) => (
                <button
                  key={p.id}
                  disabled={busy || !p.enabled}
                  onClick={() => void action((s) => connect(p, s))}
                >
                  {p.name} · {p.baseUrl}
                </button>
              ))}
            </details>
          )}
        </>
      )}
      {step === "local" && (
        <>
          <h1>Your private AI workspace</h1>
          {!isNative() ? (
            <div className="notice">
              <p>
                Automatic runtime and drive setup needs the desktop application.
                Browser preview can connect to an existing local or remote
                server.
              </p>
              <a
                href="https://docs.ollama.com/download"
                target="_blank"
                rel="noreferrer"
              >
                Manual runtime setup instructions
              </a>
              <button onClick={() => setStep("custom")}>
                Connect an existing or remote server
              </button>
            </div>
          ) : !env ? (
            <p>Inspecting this device…</p>
          ) : (
            <>
              <p>
                Application files: <code>{env.appData}</code>. Models can live
                on another drive. Aether never changes a system service,
                requests administrator access, or migrates an existing library.
              </p>
              {(env.existing.binary || env.existing.serviceRunning) && (
                <div className="notice">
                  An existing Ollama executable was found. First try connecting
                  to its service to avoid an unnecessary second runtime.
                  <button
                    disabled={busy}
                    onClick={() =>
                      void action((s) =>
                        connect(
                          {
                            ...custom,
                            name: "Existing local Ollama",
                            kind: "ollama",
                            baseUrl:
                              env.existing.endpoint ?? "http://127.0.0.1:11434",
                          },
                          s,
                        ),
                      )
                    }
                  >
                    Connect to existing Ollama
                  </button>
                  {env.existing.modelDirectory && (
                    <p>
                      Reported existing service model folder:{" "}
                      {env.existing.modelDirectory}. This folder is not
                      Aether-owned.
                    </p>
                  )}
                </div>
              )}
              {env.managed && (
                <div className="notice">
                  <p>
                    Previously configured Aether runtime: {env.managed.endpoint}
                    . Its files are preserved.
                  </p>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void action((s) =>
                        connect(
                          {
                            ...custom,
                            name: "Aether local AI",
                            kind: "ollama",
                            baseUrl: env.managed!.endpoint,
                          },
                          s,
                          "aether",
                        ),
                      )
                    }
                  >
                    Reconnect to Aether runtime
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        if (
                          !(await confirmAction(
                            "Stop only the runtime child started by this Aether session? External services are never stopped.",
                            true,
                          ))
                        )
                          return;
                        await setupNative.stop();
                        setStatus("Aether child stopped; files preserved.");
                      })
                    }
                  >
                    Stop Aether session runtime
                  </button>
                </div>
              )}
              {!canInstall && (
                <div className="notice">
                  Automatic management is unavailable on this platform. Connect
                  an existing/remote server or follow{" "}
                  <a
                    href="https://docs.ollama.com/download"
                    target="_blank"
                    rel="noreferrer"
                  >
                    manual setup
                  </a>
                  .
                </div>
              )}
              {canInstall && (
                <>
                  <StorageLocation
                    initial={
                      env.managed?.layout.root.replace(
                        /[/\\]aether-data$/,
                        "",
                      ) ?? env.defaultStorage
                    }
                    onPrepared={setLayout}
                    requiredBytes={modelBytes}
                  />
                  {layout && (
                    <>
                      <div className="notice">
                        Storage approved: {layout.root}. This creates an
                        independent library, not a relocation of the existing
                        service’s models.
                      </div>
                      {env.existing.binary && (
                        <label className="switch">
                          <input
                            type="checkbox"
                            disabled={busy}
                            checked={useBinary}
                            onChange={(e) => setUseBinary(e.target.checked)}
                          />
                          Reuse the installed executable for this separate
                          Aether-owned process (no reinstall)
                        </label>
                      )}
                      {!useBinary && (
                        <>
                          <button
                            disabled={busy}
                            onClick={() =>
                              void action(async () => {
                                setRelease(await setupNative.release());
                                setStatus(
                                  "Review the download size and official release before approving.",
                                );
                              })
                            }
                          >
                            Check official runtime download
                          </button>
                          {release && (
                            <div className="notice">
                              <p>
                                Ollama {release.version} ·{" "}
                                {(release.bytes / 1e9).toFixed(2)} GB archive.
                                Download and extraction may require up to four
                                times that space in application data. Integrity
                                is checked using the official SHA-256 digest. No
                                system installation or service edits.
                              </p>
                              <button
                                disabled={busy || installed}
                                onClick={() =>
                                  void action(async () => {
                                    if (
                                      !(await confirmAction(
                                        `Download and install the official ${release.version} runtime (${(release.bytes / 1e9).toFixed(2)} GB) inside application data?`,
                                        true,
                                      ))
                                    )
                                      return;
                                    await setupNative.install();
                                    setInstalled(true);
                                    setStatus(
                                      "Runtime archive verified and installed. It has not been started.",
                                    );
                                  })
                                }
                              >
                                Approve runtime download and installation
                              </button>
                            </div>
                          )}
                        </>
                      )}
                      <button
                        className="primary"
                        disabled={
                          busy || (!useBinary && !installed && !env.managed)
                        }
                        onClick={() =>
                          void action(async (s) => {
                            if (
                              !(await confirmAction(
                                "Start an isolated Aether-owned runtime on a private loopback port using only the approved model folder? No existing service will be restarted.",
                                true,
                              ))
                            )
                              return;
                            const config = await setupNative.start(
                              layout,
                              useBinary,
                            );
                            setEnv((old) =>
                              old ? { ...old, managed: config } : old,
                            );
                            await connect(
                              {
                                ...custom,
                                name: "Aether local AI",
                                kind: "ollama",
                                baseUrl: config.endpoint,
                              },
                              s,
                              "aether",
                            );
                          })
                        }
                      >
                        Approve and start local AI
                      </button>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}
      {step === "models" && selected && (
        <>
          <h1>
            {models.length
              ? "Choose your first model"
              : "Your connection is ready. Add a model."}
          </h1>
          <div className="notice">
            <strong>{selected.name}</strong>
            <p>{selected.baseUrl}</p>
            <p>{ownershipDescription(ownership)}</p>
            {ownership === "external" && (
              <p>
                Models stay wherever this server already stores them. Changing
                Aether’s download folder does not move the server’s models.
              </p>
            )}
            {env?.existing.modelDirectory &&
              env.existing.endpoint === selected.baseUrl && (
                <p>
                  Existing service storage: {env.existing.modelDirectory} ·{" "}
                  {env.existing.configurationSource}
                </p>
              )}
          </div>
          {models.length > 0 && (
            <label>
              Model
              <select
                disabled={busy}
                value={model}
                onChange={(e) => {
                  setModel(e.target.value);
                  setTested(false);
                }}
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id}
                    {m.size ? ` · ${(m.size / 1e9).toFixed(2)} GB` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          {selected.kind === "ollama" ? (
            <details open={!models.length}>
              <summary>Download or resume a model</summary>
              <p>
                Choose a model from the{" "}
                <a
                  href="https://ollama.com/library"
                  target="_blank"
                  rel="noreferrer"
                >
                  Ollama catalog
                </a>
                . The server controls its download directory and safely reuses
                matching partial layers on retry. The exact size may be unknown
                until the download starts; review the model page first.
                Downloads may use several GB.
              </p>
              {isNative() && (
                <>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        setStarterModels(await setupNative.starterModels());
                        setStatus(
                          "Availability and sizes checked with the official registry. No model downloaded.",
                        );
                      })
                    }
                  >
                    Find small starter models
                  </button>
                  {starterModels.map((m) => (
                    <div className="notice row spread" key={m.name}>
                      <span>
                        {m.name} · {(m.bytes / 1e9).toFixed(2)} GB ·{" "}
                        <a href={m.source} target="_blank" rel="noreferrer">
                          Model details &amp; license
                        </a>
                      </span>
                      <button
                        disabled={busy}
                        onClick={() => {
                          setPullName(m.name);
                          setModelBytes(m.bytes);
                        }}
                      >
                        Choose this model
                      </button>
                    </div>
                  ))}
                </>
              )}
              <label>
                Model name
                <input
                  disabled={busy}
                  value={pullName}
                  onChange={(e) => {
                    setPullName(e.target.value);
                    setModelBytes(undefined);
                  }}
                  placeholder="Name from the model catalog"
                />
              </label>
              <button
                disabled={busy || !pullName.trim()}
                onClick={() =>
                  void action(async (s) => {
                    if (
                      !(await confirmAction(
                        `Download ${pullName} through ${selected.baseUrl}? This writes to that server's model library; estimated model bytes: ${modelBytes ? (modelBytes / 1e9).toFixed(2) + " GB" : "unknown"}.`,
                      ))
                    )
                      return;
                    if (modelBytes) {
                      const target =
                        ownership === "aether"
                          ? layout?.models
                          : env?.existing.endpoint === selected.baseUrl
                            ? env.existing.modelDirectory
                            : undefined;
                      if (target) {
                        const report = await setupNative.inspect(
                          target,
                          modelBytes,
                        );
                        if (
                          (ownership === "aether" && !report.writable) ||
                          report.sufficient === false
                        )
                          throw new Error(
                            "Selected model does not fit or the model folder is not writable. Choose a smaller model or review the runtime storage.",
                          );
                      }
                    }
                    for await (const event of new ProviderClient(selected).pull(
                      pullName,
                      s,
                    ))
                      setStatus(
                        `${event.status}${event.total ? ` · ${(((event.completed ?? 0) / event.total) * 100).toFixed(1)}% · ${(event.total / 1e9).toFixed(2)} GB` : ""}`,
                      );
                    const list = await new ProviderClient(selected).models(s);
                    setModels(list);
                    setModel(
                      list.find(
                        (m) =>
                          m.id === pullName || m.id === pullName + ":latest",
                      )?.id ??
                        list[0]?.id ??
                        "",
                    );
                    setTested(false);
                    setStatus(
                      "Download finished and model inventory refreshed.",
                    );
                  })
                }
              >
                Download / resume selected model
              </button>
            </details>
          ) : (
            <p>
              This server does not expose model installation through the
              supported API. Install models in its own application, then{" "}
              <button
                disabled={busy}
                onClick={() =>
                  void action((s) => connect(selected, s, ownership))
                }
              >
                Refresh models
              </button>
              .
            </p>
          )}
          <button
            disabled={busy || !model}
            onClick={() =>
              void action(async (s) => {
                const msg: Message = {
                  id: uid(),
                  role: "user",
                  parts: [
                    { type: "text", text: "Reply with a short greeting." },
                  ],
                  status: "complete",
                  createdAt: new Date().toISOString(),
                };
                let answer = "";
                for await (const d of new ProviderClient(selected).chat(
                  model,
                  [msg],
                  defaults().options,
                  s,
                ))
                  if (d.text) {
                    answer += d.text;
                    setStatus(answer.slice(0, 500));
                  }
                if (!answer.trim())
                  throw new Error(
                    "Inference finished without text. Try a text-chat model.",
                  );
                setTested(true);
                setStatus(`Inference verified: ${answer.slice(0, 500)}`);
              })
            }
          >
            Run a quick AI test
          </button>
          <button
            className="primary"
            disabled={busy}
            onClick={() => setStep("finish")}
          >
            Continue with this connection
          </button>
        </>
      )}
      {step === "finish" && (
        <>
          <h1>You’re ready to begin.</h1>
          <p>
            {selected?.name} · {model || "Choose a model later in Models"}
          </p>
          <p>
            {tested
              ? "A real inference response was received."
              : "Connection verified; inference has not been tested."}
          </p>
          <p>
            No existing chats, profiles, providers or user-owned files were
            removed. You can reopen this setup from Settings at any time.
          </p>
          <button
            className="primary"
            disabled={busy}
            onClick={() => void finish()}
          >
            Open workspace
          </button>
        </>
      )}
      {step !== "welcome" && (
        <button
          disabled={busy}
          onClick={() => {
            setStep("welcome");
            setError("");
          }}
        >
          <ArrowLeft />
          Setup options
        </button>
      )}
      {busy && (
        <div className="row">
          <span role="status">
            <RefreshCw size={15} />
            Working…
          </span>
          <button
            onClick={() => {
              abort.current?.abort();
              if (isNative())
                void setupNative
                  .cancelInstall()
                  .catch((e) => setError(String(e)));
            }}
          >
            Cancel current request
          </button>
        </div>
      )}
      {status && (
        <p className="notice" role="status">
          {status}
        </p>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
