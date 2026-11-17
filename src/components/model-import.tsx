"use client";
import { confirmAction } from "@/core/consent";
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isNative } from "@/core/native";
import { endpointScope, type Provider } from "@/core/domain";
type Candidate = {
  path: string;
  size: number;
  digest: string;
  version: number;
};
export function ModelImport({
  provider,
  refresh,
}: {
  provider?: Provider;
  refresh: () => Promise<void>;
}) {
  const [file, setFile] = useState<Candidate>();
  const [name, setName] = useState("");
  const [system, setSystem] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  if (
    !isNative() ||
    provider?.kind !== "ollama" ||
    endpointScope(provider.baseUrl) !== "local"
  )
    return (
      <div className="notice">
        Importing a local model file requires desktop Aether and a local Ollama
        connection. Original files are always preserved.
      </div>
    );
  return (
    <details>
      <summary>Bring in an existing model file (advanced)</summary>
      <section className="card stack">
        <p>
          Select a compatible model file anywhere on your computer. Aether
          checks its header and computes SHA-256 without copying the original.
          Uploading it creates runtime-managed weights and can use additional
          disk space.
        </p>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const selected = await invoke<Candidate | null>(
                "select_import_file",
              );
              if (selected) {
                setFile(selected);
                setMessage(
                  "Header and SHA-256 checked. Review the new registration before uploading.",
                );
              }
            } catch (e) {
              setMessage(String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          Choose and inspect model file
        </button>
        {file && (
          <>
            <p>
              {file.path} · {(file.size / 1e9).toFixed(2)} GB · GGUF v
              {file.version}
            </p>
            <small>{file.digest}</small>
            <label>
              New model name
              <input
                disabled={busy}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Choose a new name"
              />
            </label>
            <label>
              Optional assistant instructions
              <textarea
                disabled={busy}
                value={system}
                onChange={(e) => setSystem(e.target.value)}
              />
            </label>
            <details>
              <summary>Preview configuration</summary>
              <pre
                style={{ whiteSpace: "pre-wrap" }}
              >{`FROM ${JSON.stringify(file.path)}\n${system ? `SYSTEM ${JSON.stringify(system)}\n` : ""}# New registration: ${name}\n# API source digest: ${file.digest}`}</pre>
            </details>
            <button
              disabled={busy || !name.trim()}
              onClick={async () => {
                if (
                  !(await confirmAction(
                    `Upload ${(file.size / 1e9).toFixed(2)} GB to ${provider.baseUrl} and create '${name}'? The original file is preserved; runtime weights may require extra space. Existing names are rejected.`,
                    true,
                  ))
                )
                  return;
                setBusy(true);
                try {
                  const result = await invoke<{ note: string }>(
                    "register_import_file",
                    { endpoint: provider.baseUrl, name, system, consent: true },
                  );
                  setMessage(result.note);
                  await refresh();
                } catch (e) {
                  setMessage(String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Approve upload and create model
            </button>
          </>
        )}
        <p role="status">{busy ? "Reading/uploading model file…" : message}</p>
      </section>
    </details>
  );
}
