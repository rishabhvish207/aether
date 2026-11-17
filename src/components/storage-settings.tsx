"use client";
import { useEffect, useState } from "react";
import { isNative } from "@/core/native";
import { setupNative, type RuntimeEnvironment } from "@/core/setup-native";
import { StorageLocation } from "./storage-location";
import type { Settings } from "@/core/domain";
export function StorageSettings({
  settings,
  save,
}: {
  settings: Settings;
  save: (s: Settings) => Promise<void>;
}) {
  const [env, setEnv] = useState<RuntimeEnvironment>();
  const [message, setMessage] = useState("");
  const [usage, setUsage] =
    useState<Awaited<ReturnType<typeof setupNative.usage>>>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (isNative())
      setupNative
        .environment()
        .then(setEnv)
        .catch((e) => setMessage(String(e)));
  }, []);
  return (
    <section className="card stack">
      <h2>Model storage</h2>
      <p>
        Preferred folder for separately downloaded model files:{" "}
        <code>{settings.modelDirectory || "Not configured"}</code>.
      </p>
      <p>
        This preference does not relocate an Ollama server’s model library.
        External server storage remains controlled by its owner. Aether-managed
        model storage can be reviewed in Setup &amp; storage; moving existing
        weights is not performed automatically.
      </p>
      {!isNative() ? (
        <p>
          Real drive information and location changes require the desktop app.
          Browser preview cannot inspect filesystem permissions or change a
          server’s storage.
        </p>
      ) : (
        env && (
          <StorageLocation
            initial={env.defaultStorage}
            onPrepared={async (layout) => {
              await save({ ...settings, modelDirectory: layout.downloads });
              setMessage(
                `Preferred downloads: ${layout.downloads}. Existing runtime/model files were preserved.`,
              );
            }}
          />
        )
      )}
      {isNative() && (
        <>
          <div className="row">
            {[
              settings.modelDirectory,
              env?.managed?.layout.models,
              env?.existing.modelDirectory,
            ]
              .filter((p, i, a): p is string => !!p && a.indexOf(p) === i)
              .map((path) => (
                <button
                  disabled={busy}
                  key={path}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      setUsage(await setupNative.usage(path));
                      setMessage(`Read-only scan of ${path}`);
                    } catch (e) {
                      setMessage(String(e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Inspect usage: {path}
                </button>
              ))}
          </div>
          {usage && (
            <div className="notice">
              <p>
                {usage.files} files · {(usage.apparentBytes / 1e9).toFixed(3)}{" "}
                GB measured apparent file sizes.{" "}
                {usage.incomplete
                  ? "Scan incomplete; some entries could not be inspected."
                  : "Scan completed."}
              </p>
              <p>
                Apparent file sizes are not recoverable disk space. Shared
                weights, hard links and active downloads may change usage. No
                blob is classified as unused or deleted.
              </p>
              <p>
                {usage.partialFiles.length} partial-download files found (up to
                100 shown).
              </p>
              {usage.partialFiles.map((p) => (
                <div key={p}>
                  <code>{p}</code>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
