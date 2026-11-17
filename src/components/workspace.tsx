"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  MessageSquare,
  Boxes,
  Users,
  Server,
  CircleGauge,
  Settings2,
  Archive,
  Info,
  Menu,
  Plus,
  Send,
  Square,
  Paperclip,
  Copy,
  GitBranch,
  Trash2,
  Download,
  RefreshCw,
  Pin,
  Pencil,
  Globe,
  Mic,
  ShieldCheck,
} from "lucide-react";
import { initializeStore } from "@/core/bootstrap";
import { StorageSettings } from "./storage-settings";
import { SetupWizard } from "./setup-wizard";
import type { SetupRecord } from "@/core/setup";
import { Markdown } from "./markdown";
import {
  brand,
  defaults,
  uid,
  textOf,
  endpointScope,
  type Settings,
  type Provider,
  type Profile,
  type Conversation,
  type Model,
  type Message,
  type Part,
} from "@/core/domain";
import { createStore, saveConversation, type Store } from "@/core/storage";
import { ProviderClient } from "@/core/providers";
import { download, exportConversation } from "@/core/portable";
import { readAttachment } from "@/core/attachments";
import {
  ProviderPanel,
  ProfilePanel,
  SettingsPanel,
  BackupPanel,
  BenchmarkPanel,
  ModelsPanel,
} from "./panels";
import { AgentPanel } from "./agents";
import { VoicePanel } from "./voice";
import { ResearchPanel } from "./research";
const navigation = [
  ["Chat", MessageSquare],
  ["Models", Boxes],
  ["AI Profiles", Users],
  ["Providers", Server],
  ["Benchmarks", CircleGauge],
  ["Settings", Settings2],
  ["Research", Globe],
  ["Voice", Mic],
  ["Agents", ShieldCheck],
  ["Backup", Archive],
  ["About", Info],
] as const;
export function Workspace() {
  const [store, setStore] = useState<Store>();
  const [settings, setSettings] = useState<Settings>(defaults);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [history, setHistory] = useState<Conversation[]>([]);
  const [active, setActive] = useState<Conversation>();
  const [view, setView] = useState("Chat");
  const [setupOpen, setSetupOpen] = useState(false);
  const [providerId, setProviderId] = useState("local-ollama");
  const [model, setModel] = useState("");
  const [profileId, setProfileId] = useState("");
  const [models, setModels] = useState<Model[]>([]);
  const [capabilityState, setCapabilityState] = useState<{
    providerId: string;
    model: string;
    values: string[];
  }>();
  const capabilities =
    capabilityState?.providerId === providerId &&
    capabilityState.model === model
      ? capabilityState.values
      : [];
  const inventoryRequest = useRef<AbortController | null>(null);
  const [health, setHealth] = useState("Not tested");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<Part[]>([]);
  const [search, setSearch] = useState("");
  const [menu, setMenu] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const [unread, setUnread] = useState(false);
  const provider = providers.find((p) => p.id === providerId);
  const profile = profiles.find((p) => p.id === profileId);
  useEffect(() => {
    const s = createStore();
    (async () => {
      await initializeStore(s);
      const config = await s.get<Settings>("settings", "app");
      const ps = await s.list<Provider>("providers");
      const fs = await s.list<Profile>("profiles");
      const hs = await s.list<Conversation>("conversations");
      setProfiles(fs);
      setProfileId(fs.find((p) => p.name === "General Assistant")?.id ?? "");
      setSettings(config ?? defaults());
      setProviders(ps);
      const setup = await s.get<SetupRecord>("setup", "current");
      setProviderId(
        ps.find((p) => p.id === setup?.providerId && p.enabled)?.id ??
          ps.find((p) => p.enabled)?.id ??
          "",
      );
      if (setup?.model) setModel(setup.model);
      setHistory(hs);
      setStore(s);
    })().catch((e) => setError(String(e)));
    return () => abort.current?.abort();
  }, []);
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      root.dataset.theme =
        settings.theme === "system"
          ? matchMedia("(prefers-color-scheme: light)").matches
            ? "light"
            : "dark"
          : settings.theme;
    };
    apply();
    const mq = matchMedia("(prefers-color-scheme: light)");
    mq.addEventListener("change", apply);
    root.style.setProperty("--font", `${settings.fontSize}px`);
    root.style.setProperty("--chat", `${settings.chatWidth}px`);
    root.dataset.compact = String(settings.density === "compact");
    root.dataset.solid = String(settings.solid);
    root.dataset.contrast = String(settings.contrast);
    root.dataset.reduced = String(settings.reducedMotion);
    return () => mq.removeEventListener("change", apply);
  }, [settings]);
  const refresh = useCallback(async () => {
    inventoryRequest.current?.abort();
    const controller = new AbortController();
    inventoryRequest.current = controller;
    if (!provider || !provider.enabled) {
      setModels([]);
      setHealth("Disabled");
      setModel("");
      return;
    }
    setHealth("Connecting");
    setModels([]);
    setCapabilityState(undefined);
    try {
      const list = await new ProviderClient(provider).models(controller.signal);
      if (controller.signal.aborted) return;
      setModels(list);
      setModel((old) =>
        list.some((m) => m.id === old) ? old : (list[0]?.id ?? ""),
      );
      setHealth(`Connected · ${list.length} models`);
    } catch (e) {
      if (!controller.signal.aborted) setHealth(String(e));
    }
  }, [provider]);
  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    return () => {
      clearTimeout(timer);
      inventoryRequest.current?.abort();
    };
  }, [refresh]);
  useEffect(() => {
    let current = true;
    if (provider && model)
      new ProviderClient(provider)
        .show(model)
        .then((d) => {
          if (current)
            setCapabilityState({
              providerId: provider.id,
              model,
              values: Array.isArray(d.capabilities) ? d.capabilities : [],
            });
        })
        .catch(() => {});
    return () => {
      current = false;
    };
  }, [provider, model]);
  const saveSettings = async (s: Settings) => {
    if (!store) return;
    try {
      await store.put("settings", { ...s, id: "app" });
      setSettings(s);
    } catch (e) {
      setError(String(e));
      throw e;
    }
  };
  const persist = async (c: Conversation) => {
    if (!store) return;
    await saveConversation(store, c);
    if (!c.temporary)
      setHistory((old) => [c, ...old.filter((x) => x.id !== c.id)]);
  };
  const newChat = (temporary = false) => {
    if (busy) return;
    setAttachments([]);
    setDraft("");
    setActive({
      id: uid(),
      title: "New conversation",
      providerId,
      model,
      profileId,
      temporary,
      messages: [],
      pinned: false,
      folder: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    setView("Chat");
  };
  async function generate(base: Conversation, messages: Message[]) {
    if (!provider?.enabled || !models.some((m) => m.id === model) || busy)
      return;
    if (
      (profile?.providerId && profile.providerId !== providerId) ||
      (profile?.model && profile.model !== model)
    ) {
      setError(
        "Profile binding mismatch. Select the bound provider/model or edit the profile.",
      );
      return;
    }
    if (profile?.capabilities.some((c) => !capabilities.includes(c))) {
      setError(
        "The model has not advertised all capabilities required by this profile. Edit the profile requirements or select a compatible model.",
      );
      return;
    }
    setError("");
    setBusy(true);
    const controller = new AbortController();
    abort.current = controller;
    const response: Message = {
      id: uid(),
      role: "assistant",
      parts: [],
      status: "generating",
      createdAt: new Date().toISOString(),
    };
    let c: Conversation = {
      ...base,
      providerId,
      model,
      profileId,
      messages: [...messages, response],
      updatedAt: new Date().toISOString(),
    };
    setActive(c);
    try {
      await persist(c);
      const system: Message = {
        id: uid(),
        role: "system",
        parts: [
          {
            type: "text",
            text:
              (profile?.systemPrompt ?? "") +
              (profile?.outputStyle
                ? `\nOutput preference: ${profile.outputStyle}`
                : ""),
          },
        ],
        status: "complete",
        createdAt: new Date().toISOString(),
      };
      for await (const delta of new ProviderClient(provider).chat(
        model,
        [system, ...messages],
        profile?.options ?? settings.options,
        controller.signal,
        {
          keepAlive: settings.keepAlive,
          think:
            settings.think === "default" ? undefined : settings.think === "on",
        },
      )) {
        for (const [key, type] of [
          ["text", "text"],
          ["thinking", "thinking"],
        ] as const) {
          if (delta[key]) {
            const part = response.parts.find((p) => p.type === type);
            if (part) part.text += delta[key];
            else response.parts.push({ type, text: delta[key]! });
          }
        }
        if (delta.metrics) response.metrics = delta.metrics;
        c = {
          ...c,
          messages: [
            ...messages,
            { ...response, parts: response.parts.map((p) => ({ ...p })) },
          ],
        };
        setActive(c);
        if (follow.current) bottom.current?.scrollIntoView({ block: "end" });
        else setUnread(true);
      }
      response.status = "complete";
    } catch (e) {
      response.status = controller.signal.aborted ? "stopped" : "error";
      if (!controller.signal.aborted) {
        response.parts.push({ type: "error", text: String(e) });
        setError(String(e));
      }
    } finally {
      c = {
        ...c,
        messages: [...messages, { ...response }],
        updatedAt: new Date().toISOString(),
      };
      setActive(c);
      try {
        await persist(c);
      } catch (e) {
        setError(`History save failed: ${e}`);
      }
      setBusy(false);
      abort.current = null;
    }
  }
  async function send() {
    if (busy) return;
    if (!provider?.enabled || !models.some((m) => m.id === model)) {
      setError(
        "Reconnect and select an available model. Your draft has been kept.",
      );
      return;
    }
    if (!draft.trim() && !attachments.length) return;
    const base = active ?? {
      id: uid(),
      title: draft.slice(0, 70) || "Attachment conversation",
      providerId,
      model,
      profileId,
      temporary: false,
      messages: [],
      pinned: false,
      folder: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const message: Message = {
      id: uid(),
      role: "user",
      parts: [{ type: "text", text: draft }, ...attachments],
      status: "complete",
      createdAt: new Date().toISOString(),
    };
    setDraft("");
    setAttachments([]);
    await generate(
      {
        ...base,
        title: base.messages.length
          ? base.title
          : draft.slice(0, 70) || base.title,
      },
      [...base.messages, message],
    );
  }
  const branch = (index: number) => {
    if (!active || busy) return;
    const c = {
      ...active,
      id: uid(),
      parentId: active.id,
      title: `${active.title} (branch)`,
      messages: active.messages.slice(0, index + 1),
      updatedAt: new Date().toISOString(),
    };
    setActive(c);
    void persist(c).catch((e) => setError(String(e)));
  };
  const readFiles = async (files: FileList | null) => {
    if (!files) return;
    try {
      const parts = await Promise.all(
        Array.from(files).map((f) =>
          readAttachment(
            f,
            provider?.kind === "ollama" && capabilities.includes("vision"),
          ),
        ),
      );
      setAttachments((old) => [...old, ...parts]);
    } catch (e) {
      setError(String(e));
    }
  };
  if (!store)
    return (
      <div className="content" role="status">
        Opening local workspace…{error && <p role="alert">{error}</p>}
      </div>
    );
  if (!settings.onboarded || setupOpen)
    return (
      <main className="setup-page">
        <SetupWizard
          store={store}
          providers={providers}
          onClose={settings.onboarded ? () => setSetupOpen(false) : undefined}
          onDone={async ({ record, provider }) => {
            setProviders(await store.list<Provider>("providers"));
            setSettings(
              (await store.get<Settings>("settings", "app")) ?? defaults(),
            );
            if (provider) {
              setProviderId(provider.id);
              setModel(record.model ?? "");
            }
            setSetupOpen(false);
            setView("Chat");
          }}
        />
      </main>
    );
  return (
    <div className="app">
      <aside className={`sidebar ${menu ? "open" : ""}`}>
        <div className="brand">
          {brand.name}
          <div className="eyebrow">Your local workspace</div>
        </div>
        <button
          className="primary"
          disabled={busy}
          onClick={() => {
            newChat();
            setMenu(false);
          }}
        >
          <Plus />
          New conversation
        </button>
        <nav aria-label="Main navigation">
          {navigation.map(([name, Icon]) => (
            <button
              key={name}
              className={view === name ? "active" : ""}
              onClick={() => {
                setView(name);
                setMenu(false);
              }}
            >
              <Icon />
              {name}
            </button>
          ))}
        </nav>
        <footer>
          No telemetry.
          <br />
          Your providers. Your data.
          <br />
          {"__TAURI_INTERNALS__" in window
            ? "Native desktop"
            : "Browser preview · IndexedDB"}
        </footer>
      </aside>
      <main
        onScroll={(e) => {
          const el = e.currentTarget;
          follow.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 150;
        }}
      >
        <header className="topbar">
          <div className="row">
            <button
              className="mobile-menu"
              aria-label="Toggle navigation"
              onClick={() => setMenu(!menu)}
            >
              <Menu />
            </button>
            <strong>{view}</strong>
            <span className="chip">Local-first</span>
          </div>
          <small className="endpoint">
            {provider?.baseUrl} ·{" "}
            {provider ? endpointScope(provider.baseUrl) : "No provider"}
          </small>
        </header>
        <div className="content stack">
          {error && (
            <div className="notice error row spread" role="alert">
              <span>{error}</span>
              <button onClick={() => setError("")}>Dismiss</button>
            </div>
          )}
          {view === "Chat" && (
            <>
              <div className="toolbar">
                <label>
                  Provider
                  <select
                    disabled={busy}
                    value={providerId}
                    onChange={(e) => setProviderId(e.target.value)}
                  >
                    {providers
                      .filter((p) => p.enabled)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Model
                  <select
                    disabled={busy}
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                  >
                    <option value="">Select a model</option>
                    {models.map((m) => (
                      <option key={m.id}>{m.id}</option>
                    ))}
                  </select>
                </label>
                <label>
                  AI Profile
                  <select
                    disabled={busy}
                    value={profileId}
                    onChange={(e) => setProfileId(e.target.value)}
                  >
                    <option value="">App defaults</option>
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="row spread">
                <small role="status">{health}</small>
                <div className="row">
                  <button disabled={busy} onClick={() => void refresh()}>
                    <RefreshCw />
                    Reconnect
                  </button>
                  <button disabled={busy} onClick={() => setSetupOpen(true)}>
                    Review setup
                  </button>
                  <button disabled={busy} onClick={() => newChat(true)}>
                    Temporary chat
                  </button>
                </div>
              </div>
              <details>
                <summary>Local history · {history.length}</summary>
                <input
                  aria-label="Search history"
                  placeholder="Search titles and messages"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {history
                  .filter((c) =>
                    (c.title + c.folder + c.messages.map(textOf).join(""))
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                  )
                  .sort(
                    (a, b) =>
                      Number(b.pinned) - Number(a.pinned) ||
                      b.updatedAt.localeCompare(a.updatedAt),
                  )
                  .map((c) => (
                    <div className="row spread" key={c.id}>
                      <button
                        disabled={busy}
                        onClick={() => {
                          setActive(c);
                          setProviderId(c.providerId);
                          setModel(c.model);
                          setProfileId(c.profileId);
                          setAttachments([]);
                        }}
                      >
                        {c.pinned ? "Pinned · " : ""}
                        {c.title}
                        {c.folder ? ` / ${c.folder}` : ""}
                      </button>
                      <div className="actions">
                        <button
                          aria-label="Pin conversation"
                          disabled={busy}
                          onClick={() =>
                            void persist({ ...c, pinned: !c.pinned })
                          }
                        >
                          <Pin />
                        </button>
                        <button
                          aria-label="Rename conversation"
                          disabled={busy}
                          onClick={() => {
                            const title = prompt("Conversation title", c.title);
                            if (title?.trim()) {
                              const next = { ...c, title };
                              if (active?.id === c.id) setActive(next);
                              void persist(next);
                            }
                          }}
                        >
                          <Pencil />
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => {
                            const folder = prompt(
                              "Folder / workspace",
                              c.folder,
                            );
                            if (folder !== null) void persist({ ...c, folder });
                          }}
                        >
                          Folder
                        </button>
                        <button
                          aria-label="Delete conversation"
                          disabled={busy}
                          onClick={async () => {
                            if (
                              confirm(
                                "Permanently delete this local conversation?",
                              )
                            ) {
                              await store.remove("conversations", c.id);
                              setHistory((h) => h.filter((x) => x.id !== c.id));
                              if (active?.id === c.id) setActive(undefined);
                            }
                          }}
                        >
                          <Trash2 />
                        </button>
                      </div>
                    </div>
                  ))}
              </details>
              <section className="chat">
                <div className="messages">
                  {active?.temporary && (
                    <div className="notice">
                      Temporary chat · Messages and attachments remain in memory
                      and are discarded when you leave this conversation or
                      reload.
                    </div>
                  )}
                  {!active?.messages.length && (
                    <div className="empty">
                      <span className="eyebrow">Space to think</span>
                      <h1>What are we exploring?</h1>
                      <p className="muted">
                        Choose a model and start a conversation.
                        <br />
                        Your history lives here, on this device.
                      </p>
                    </div>
                  )}
                  {active?.messages.map((m, index) => (
                    <article key={m.id} className={`message ${m.role}`}>
                      <div className="row spread">
                        <span className="role">
                          {m.role === "assistant" ? active.model : "You"}
                        </span>
                        <small>{m.status}</small>
                      </div>
                      {m.parts.map((p, i) =>
                        p.type === "thinking" ? (
                          <details
                            key={i}
                            open={settings.showThinking || undefined}
                          >
                            <summary>Provider-supplied thinking</summary>
                            <p style={{ whiteSpace: "pre-wrap" }}>{p.text}</p>
                          </details>
                        ) : p.type === "text" ? (
                          <Markdown key={i} text={p.text} />
                        ) : p.type === "error" ? (
                          <p key={i} role="alert" className="error">
                            {p.text}
                          </p>
                        ) : (
                          <details key={i}>
                            <summary>{p.name ?? p.type}</summary>
                            {p.type === "file" ? (
                              <pre>{p.text.slice(0, 4000)}</pre>
                            ) : (
                              <p>Image included with this message.</p>
                            )}
                          </details>
                        ),
                      )}
                      {m.metrics && (
                        <details>
                          <summary>Measured metrics</summary>
                          <pre>{JSON.stringify(m.metrics, null, 2)}</pre>
                        </details>
                      )}
                      <div className="actions">
                        <button
                          onClick={() =>
                            void navigator.clipboard
                              .writeText(textOf(m))
                              .catch((e) => setError(String(e)))
                          }
                        >
                          <Copy />
                          Copy
                        </button>
                        <button disabled={busy} onClick={() => branch(index)}>
                          <GitBranch />
                          Branch
                        </button>
                        {m.role === "user" && (
                          <button
                            disabled={busy}
                            onClick={() => {
                              branch(index - 1);
                              setDraft(textOf(m));
                              setAttachments(
                                m.parts.filter(
                                  (p) =>
                                    p.type === "image" || p.type === "file",
                                ),
                              );
                            }}
                          >
                            Edit & branch
                          </button>
                        )}
                        {m.role === "assistant" && (
                          <button
                            disabled={busy}
                            onClick={() => {
                              const c = {
                                ...active!,
                                id: uid(),
                                parentId: active!.id,
                                title: `${active!.title} (retry)`,
                              };
                              void generate(
                                c,
                                active!.messages.slice(0, index),
                              );
                            }}
                          >
                            <RefreshCw />
                            Regenerate
                          </button>
                        )}
                        <button
                          disabled={busy}
                          onClick={() => {
                            if (confirm("Delete this message?")) {
                              const c = {
                                ...active!,
                                messages: active!.messages.filter(
                                  (x) => x.id !== m.id,
                                ),
                              };
                              setActive(c);
                              void persist(c);
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
                <div ref={bottom} />
                {unread && (
                  <button
                    onClick={() => {
                      bottom.current?.scrollIntoView();
                      follow.current = true;
                      setUnread(false);
                    }}
                  >
                    Jump to latest
                  </button>
                )}
                <div
                  className="composer stack"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    void readFiles(e.dataTransfer.files);
                  }}
                >
                  <textarea
                    aria-label="Message"
                    placeholder="Message your model…"
                    value={draft}
                    disabled={busy}
                    onChange={(e) => setDraft(e.target.value)}
                    onPaste={(e) => {
                      if (e.clipboardData.files.length) {
                        e.preventDefault();
                        void readFiles(e.clipboardData.files);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (
                        e.key === "Enter" &&
                        !e.shiftKey &&
                        !e.nativeEvent.isComposing
                      ) {
                        e.preventDefault();
                        void send();
                      }
                    }}
                  />
                  {attachments.map((a, i) => (
                    <div className="row" key={i}>
                      <small>
                        {a.name} ·{" "}
                        {a.type === "file"
                          ? `${a.text.length} extracted characters`
                          : "image"}
                      </small>
                      <button
                        onClick={() =>
                          setAttachments((as) => as.filter((_, n) => n !== i))
                        }
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <div className="row spread">
                    <label className="row">
                      <Paperclip size={17} />
                      Attach text / image
                      <input
                        type="file"
                        multiple
                        disabled={busy}
                        onChange={(e) => {
                          void readFiles(e.target.files);
                          e.target.value = "";
                        }}
                        style={{ maxWidth: 200 }}
                      />
                    </label>
                    {busy ? (
                      <button onClick={() => abort.current?.abort()}>
                        <Square />
                        Stop generation
                      </button>
                    ) : (
                      <button
                        className="primary"
                        disabled={
                          !models.some((m) => m.id === model) ||
                          !provider?.enabled ||
                          (!draft.trim() && !attachments.length)
                        }
                        onClick={() => void send()}
                      >
                        <Send />
                        Send
                      </button>
                    )}
                  </div>
                  {active && (
                    <details>
                      <summary>Export conversation</summary>
                      <div className="actions">
                        {(["json", "md", "txt"] as const).map((format) => (
                          <button
                            key={format}
                            onClick={() =>
                              download(
                                `conversation.${format}`,
                                exportConversation(active, format),
                                format === "json"
                                  ? "application/json"
                                  : "text/plain",
                              )
                            }
                          >
                            <Download />
                            {format.toUpperCase()} · no thinking/files/tools
                          </button>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              </section>
            </>
          )}
          {view === "Providers" && (
            <ProviderPanel
              store={store}
              providers={providers}
              onChange={setProviders}
              report={setError}
            />
          )}
          {view === "AI Profiles" && (
            <ProfilePanel
              store={store}
              profiles={profiles}
              onChange={setProfiles}
              providers={providers}
              report={setError}
            />
          )}
          {view === "Settings" && (
            <>
              <button disabled={busy} onClick={() => setSetupOpen(true)}>
                Setup &amp; storage
              </button>
              <StorageSettings settings={settings} save={saveSettings} />
              <SettingsPanel settings={settings} save={saveSettings} />
            </>
          )}
          {view === "Agents" && (
            <AgentPanel store={store} provider={provider} model={model} />
          )}
          {view === "Voice" && (
            <VoicePanel
              sendToChat={(text) => {
                setDraft(text);
                setView("Chat");
              }}
            />
          )}
          {view === "Research" && <ResearchPanel store={store} />}
          {view === "Backup" && <BackupPanel store={store} report={setError} />}
          {view === "Benchmarks" && (
            <BenchmarkPanel
              store={store}
              provider={provider}
              model={model}
              settings={settings}
              report={setError}
            />
          )}
          {view === "Models" && (
            <ModelsPanel
              downloadDirectory={settings.modelDirectory}
              provider={provider}
              models={models}
              refresh={refresh}
              report={setError}
            />
          )}
          {view === "About" && (
            <section className="card stack">
              <h1>{brand.name}</h1>
              <p>Version {brand.version} · Local-first AI workspace</p>
              <p>
                No telemetry, hosted account or hidden cloud synchronization.
                Messages leave the device only for your selected inference
                provider. Browser data uses IndexedDB; native data uses SQLite.
                Provider keys currently stay in session memory.
              </p>
              <h2>Third-party software</h2>
              <p>
                Next.js, React, Tailwind CSS, Lucide, Tauri, Rust, idb, Zod,
                react-markdown, remark-gfm and highlight.js. See
                THIRD_PARTY_NOTICES.md for licenses. Model weights and speech
                engines have their own licenses. Application license and
                maintainer links await the maintainer’s selection.
              </p>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
