"use client";
import { useEffect, useRef, useState } from "react";
import { uid } from "@/core/domain";
import type { Store } from "@/core/storage";
import {
  searchWeb,
  extractSource,
  researchReport,
  type ResearchWorkspace,
  type Source,
} from "@/core/research";
import { download } from "@/core/portable";
export function ResearchPanel({ store }: { store: Store }) {
  const [workspaces, setWorkspaces] = useState<ResearchWorkspace[]>([]);
  const [active, setActive] = useState<ResearchWorkspace>();
  const [endpoint, setEndpoint] = useState("");
  const [query, setQuery] = useState("");
  const [url, setUrl] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null);
  useEffect(() => {
    store
      .list<ResearchWorkspace>("research")
      .then(setWorkspaces)
      .catch((e) => setError(String(e)));
    return () => abort.current?.abort();
  }, [store]);
  async function addSources(action: (s: AbortSignal) => Promise<Source[]>) {
    if (!consent) return;
    setBusy(true);
    const c = new AbortController();
    abort.current = c;
    try {
      const sources = await action(c.signal);
      setActive((w) => ({
        ...w!,
        sources: [
          ...w!.sources,
          ...sources.filter(
            (s) => !w!.sources.some((old) => old.url === s.url),
          ),
        ],
        updatedAt: new Date().toISOString(),
      }));
      setError("");
    } catch (e) {
      setError(
        `${e}. Browser extraction requires source CORS permission; no proxy is used.`,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="stack">
      <div className="row spread">
        <h1>Research workspaces</h1>
        <button
          onClick={() => {
            setConsent(false);
            setActive({
              id: uid(),
              title: "New research",
              sources: [],
              notes: "",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          }}
        >
          New workspace
        </button>
      </div>
      <div className="row">
        {workspaces.map((w) => (
          <button
            key={w.id}
            disabled={busy}
            onClick={() => {
              setActive(w);
              setConsent(false);
            }}
          >
            {w.title}
          </button>
        ))}
      </div>
      {!active ? (
        <div className="notice">
          Create or open a source collection. Research is opt-in. No network
          search runs automatically.
        </div>
      ) : (
        <>
          <section className="card stack">
            <label>
              Workspace title
              <input
                value={active.title}
                onChange={(e) =>
                  setActive({ ...active, title: e.target.value })
                }
              />
            </label>
            <label className="switch">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              Allow network access for this research session. Queries go to the
              chosen SearXNG server; opening a source contacts its website.
            </label>
            <label>
              SearXNG instance base URL (JSON API + CORS required)
              <input
                type="url"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
              />
            </label>
            <label>
              Search query
              <input value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            <button
              disabled={!consent || !query || !endpoint || busy}
              onClick={() =>
                void addSources((s) => searchWeb(endpoint, query, s))
              }
            >
              Search web
            </button>
            <label>
              Exact source URL
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </label>
            <button
              disabled={!consent || !url || busy}
              onClick={() =>
                void addSources(async (s) => [await extractSource(url, s)])
              }
            >
              Open & extract source
            </button>
            {busy && (
              <button onClick={() => abort.current?.abort()}>
                Cancel network request
              </button>
            )}
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
          </section>
          {active.sources.map((s, i) => (
            <article className="card stack" key={s.id}>
              <h2>
                [{i + 1}] {s.title}
              </h2>
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.url}
              </a>
              <small>
                Retrieved {s.retrievedAt} · source content, not model synthesis
              </small>
              <details>
                <summary>Inspect retrieved excerpt</summary>
                <p>{s.excerpt}</p>
              </details>
              <button
                disabled={busy}
                onClick={() =>
                  setActive({
                    ...active,
                    sources: active.sources.filter((x) => x.id !== s.id),
                  })
                }
              >
                Remove source
              </button>
            </article>
          ))}
          <section className="card stack">
            <label>
              User notes / synthesis (cite source numbers explicitly)
              <textarea
                value={active.notes}
                onChange={(e) =>
                  setActive({ ...active, notes: e.target.value })
                }
              />
            </label>
            <div className="row">
              <button
                onClick={async () => {
                  try {
                    await store.put("research", active);
                    setWorkspaces((ws) => [
                      active,
                      ...ws.filter((w) => w.id !== active.id),
                    ]);
                  } catch (e) {
                    setError(String(e));
                  }
                }}
              >
                Save workspace
              </button>
              <button
                onClick={() =>
                  download(
                    "research.md",
                    researchReport(active),
                    "text/markdown",
                  )
                }
              >
                Export report
              </button>
              <button
                onClick={async () => {
                  if (confirm("Delete this source collection and notes?")) {
                    await store.remove("research", active.id);
                    setWorkspaces((ws) => ws.filter((w) => w.id !== active.id));
                    setActive(undefined);
                  }
                }}
              >
                Delete workspace
              </button>
            </div>
          </section>
        </>
      )}
    </section>
  );
}
