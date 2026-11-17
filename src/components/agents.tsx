"use client";
import { useEffect, useRef, useState } from "react";
import { uid, type Provider } from "@/core/domain";
import type { Store } from "@/core/storage";
import {
  runAgent,
  type AgentRun,
  type WorkspaceFiles,
  type Approval,
} from "@/core/agents";
import { pickWorkspace, supportsWorkspacePicker } from "@/core/workspace-files";
import { agentTurn } from "@/core/agent-provider";
export function AgentPanel({
  store,
  provider,
  model,
}: {
  store: Store;
  provider?: Provider;
  model: string;
}) {
  const [files, setFiles] = useState<WorkspaceFiles>();
  const [prompt, setPrompt] = useState("");
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [active, setActive] = useState<AgentRun>();
  const [approval, setApproval] = useState<Approval>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [iterations, setIterations] = useState(5);
  const abort = useRef<AbortController | null>(null);
  const decision = useRef<((allowed: boolean) => void) | null>(null);
  useEffect(() => {
    store
      .list<AgentRun>("agentRuns")
      .then(setRuns)
      .catch((e) => setError(String(e)));
    return () => {
      decision.current?.(false);
      abort.current?.abort();
    };
  }, [store]);
  async function run() {
    if (!provider || !model || !files || busy) return;
    setError("");
    setBusy(true);
    const controller = new AbortController();
    abort.current = controller;
    const current: AgentRun = {
      id: uid(),
      createdAt: new Date().toISOString(),
      status: "running",
      events: [],
      providerId: provider.id,
      model,
      prompt,
      workspace: files.name,
      limits: {
        iterations: Math.max(1, Math.min(20, iterations)),
        seconds: 180,
        outputTokens: 8192,
      },
    };
    setActive({ ...current });
    try {
      await store.put("agentRuns", current);
      await runAgent({
        run: current,
        files,
        signal: controller.signal,
        approve: (proposal) =>
          new Promise((resolve) => {
            decision.current = resolve;
            setApproval(proposal);
          }),
        turn: (messages, signal) =>
          agentTurn(provider, model, messages, signal),
        event: async (event) => {
          current.events.push(event);
          await store.put("agentRuns", current);
          setActive({ ...current, events: [...current.events] });
        },
      });
      current.status = "complete";
    } catch (e) {
      current.status = controller.signal.aborted ? "cancelled" : "error";
      setError(String(e));
      current.events.push({
        id: uid(),
        at: new Date().toISOString(),
        kind: "error",
        text: String(e),
      });
    } finally {
      decision.current?.(false);
      decision.current = null;
      setApproval(undefined);
      try {
        await store.put("agentRuns", current);
        setRuns((old) => [current, ...old.filter((r) => r.id !== current.id)]);
      } catch (e) {
        setError(String(e));
      }
      setActive({ ...current });
      setBusy(false);
    }
  }
  return (
    <section className="stack">
      <h1>Controlled agents</h1>
      <div className="notice">
        Tools are disabled until you select a workspace. Every list/read/write
        requires a separate approval. Shell execution, package installation and
        arbitrary native commands are blocked. Files and tool output cannot
        alter application permissions. Audit records may contain private file
        content.
      </div>
      <section className="card stack">
        <p>
          {provider?.name} · {model || "Select model in Chat"} · workspace:{" "}
          {files?.name ?? "none"}
        </p>
        <button
          disabled={busy || !supportsWorkspacePicker()}
          onClick={async () => {
            try {
              setFiles(await pickWorkspace());
            } catch (e) {
              setError(String(e));
            }
          }}
        >
          Select approved workspace
        </button>
        {!supportsWorkspacePicker() && (
          <p>
            This platform does not support the browser workspace picker. The
            native filesystem agent executor is not yet implemented; no tools
            can execute here.
          </p>
        )}
        <label>
          Task
          <textarea
            disabled={busy}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </label>
        <label>
          Maximum iterations (180 second / 8192 output-token budget)
          <input
            type="number"
            min={1}
            max={20}
            value={iterations}
            disabled={busy}
            onChange={(e) => setIterations(Number(e.target.value))}
          />
        </label>
        {busy ? (
          <button
            onClick={() => {
              decision.current?.(false);
              abort.current?.abort();
            }}
          >
            Cancel agent run
          </button>
        ) : (
          <button
            disabled={!files || !provider || !model || !prompt.trim()}
            onClick={() => void run()}
          >
            Start controlled run
          </button>
        )}
      </section>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        {runs.map((r) => (
          <button key={r.id} disabled={busy} onClick={() => setActive(r)}>
            {r.createdAt} · {r.status}
          </button>
        ))}
      </div>
      {active && (
        <section className="card stack">
          <h2>Step history · {active.status}</h2>
          <p>{active.prompt}</p>
          {active.events.map((e) => (
            <details
              key={e.id}
              open={e.kind === "proposal" || e.kind === "error"}
            >
              <summary>
                {e.at} · {e.kind}
              </summary>
              <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {e.text}
              </pre>
            </details>
          ))}
        </section>
      )}
      {approval && (
        <div
          className="modal"
          role="dialog"
          aria-modal="true"
          aria-label="Approve workspace operation"
        >
          <section className="card stack">
            <h2>Approve {approval.call.name}?</h2>
            <pre style={{ whiteSpace: "pre-wrap" }}>
              {JSON.stringify(approval.call.arguments, null, 2)}
            </pre>
            {approval.after !== undefined && (
              <>
                <h2>Before (original content)</h2>
                <pre style={{ whiteSpace: "pre-wrap" }}>
                  {approval.before || "(empty / new file)"}
                </pre>
                <h2>After (proposed content)</h2>
                <pre style={{ whiteSpace: "pre-wrap" }}>{approval.after}</pre>
                <small>
                  Review the complete replacement before approving. Automatic
                  rollback is not implemented; original content remains in this
                  preview only. Back up your workspace before edits.
                </small>
              </>
            )}
            <div className="row">
              <button
                onClick={() => {
                  decision.current?.(false);
                  decision.current = null;
                  setApproval(undefined);
                }}
              >
                Deny
              </button>
              <button
                onClick={() => {
                  decision.current?.(true);
                  decision.current = null;
                  setApproval(undefined);
                }}
              >
                Approve this operation
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
