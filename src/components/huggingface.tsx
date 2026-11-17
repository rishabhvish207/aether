"use client";
import { useEffect, useRef, useState } from "react";
import {
  searchModels,
  repoFiles,
  resolvedFileUrl,
  repoSchema,
} from "@/core/huggingface";
import type { z } from "zod";
export function HuggingFaceSearch({
  select,
}: {
  select: (url: string, filename: string, checksum: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string }[]>([]);
  const [repo, setRepo] = useState<z.infer<typeof repoSchema>>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  async function request(action: (signal: AbortSignal) => Promise<void>) {
    setBusy(true);
    const c = new AbortController();
    abort.current = c;
    try {
      await action(c.signal);
      setError("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <details>
      <summary>Discover GGUF files on Hugging Face</summary>
      <div className="stack">
        <p className="muted">
          Searching contacts huggingface.co. Model licenses are separate from
          this application. Gated/private downloads require authentication and
          are not currently supported.
        </p>
        <label>
          Repository search
          <input value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <button
          disabled={busy || !query.trim()}
          onClick={() =>
            void request(async (s) => setResults(await searchModels(query, s)))
          }
        >
          Search Hugging Face
        </button>
        {busy && (
          <button onClick={() => abort.current?.abort()}>
            Cancel discovery
          </button>
        )}
        <div className="row">
          {results.map((r) => (
            <button
              disabled={busy}
              key={r.id}
              onClick={() =>
                void request(async (s) => setRepo(await repoFiles(r.id, s)))
              }
            >
              {r.id}
            </button>
          ))}
        </div>
        {repo && (
          <>
            <a
              href={`https://huggingface.co/${repo.id}`}
              target="_blank"
              rel="noreferrer"
            >
              Model card / license:{" "}
              {repo.cardData?.license ?? "Review repository terms"}
            </a>
            <small>Revision {repo.sha}</small>
            {repo.siblings
              .filter((f) => f.rfilename.toLowerCase().endsWith(".gguf"))
              .map((f) => (
                <div className="row spread" key={f.rfilename}>
                  <span>
                    {f.rfilename} ·{" "}
                    {f.lfs?.size || f.size
                      ? `${((f.lfs?.size ?? f.size ?? 0) / 1e9).toFixed(2)} GB`
                      : "size not supplied"}
                  </span>
                  <button
                    disabled={!!repo.gated}
                    onClick={() =>
                      select(
                        resolvedFileUrl(repo.id, repo.sha, f.rfilename),
                        f.rfilename.split("/").at(-1)!,
                        f.lfs?.sha256 ?? "",
                      )
                    }
                  >
                    Select direct file
                  </button>
                </div>
              ))}
          </>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
    </details>
  );
}
