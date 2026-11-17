"use client";
import { confirmAction } from "@/core/consent";
import { useState } from "react";
import {
  setupNative,
  type StorageReport,
  type StorageLayout,
} from "@/core/setup-native";
const gb = (n: number) => `${(n / 1e9).toFixed(2)} GB`;
export function StorageLocation({
  initial,
  onPrepared,
  requiredBytes,
}: {
  initial: string;
  onPrepared: (layout: StorageLayout) => void | Promise<void>;
  requiredBytes?: number;
}) {
  const [path, setPath] = useState(initial);
  const [report, setReport] = useState<StorageReport>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="stack">
      <label>
        Model library location
        <input
          value={path}
          disabled={busy}
          onChange={(e) => {
            setPath(e.target.value);
            setReport(undefined);
          }}
        />
      </label>
      <div className="row">
        <button
          disabled={busy}
          onClick={async () => {
            try {
              const selected = await setupNative.choose();
              if (selected) {
                setPath(selected);
                setReport(undefined);
              }
            } catch (e) {
              setError(String(e));
            }
          }}
        >
          Choose another drive or folder
        </button>
        <button
          disabled={busy || !path}
          onClick={async () => {
            setBusy(true);
            try {
              setReport(await setupNative.inspect(path, requiredBytes));
              setError("");
            } catch (e) {
              setError(String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          Check location
        </button>
      </div>
      {report && (
        <>
          <dl className="grid">
            {[
              ["Drive / mount", report.mount ?? "Unavailable"],
              ["Filesystem", report.filesystem ?? "Unavailable"],
              ["Capacity", gb(report.totalBytes)],
              ["Used", gb(report.usedBytes)],
              ["Available", gb(report.freeBytes)],
              [
                "Writable",
                report.writable
                  ? "Preflight passed; write check on approval"
                  : "No",
              ],
              [
                "Estimated requirement",
                requiredBytes ? gb(requiredBytes) : "Depends on chosen model",
              ],
              [
                "Enough space",
                report.sufficient === undefined
                  ? "Select a model to estimate"
                  : report.sufficient
                    ? "Yes (with safety reserve)"
                    : "No",
              ],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="muted">{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {report.warnings.map((w) => (
            <p key={w} className="notice">
              {w}
            </p>
          ))}
          <p>
            Aether will create an owned <code>aether-data</code> subfolder
            containing managed models, separate downloads and imported
            originals. Existing files stay untouched. App configuration and
            executables remain in application data.
          </p>
          <button
            className="primary"
            disabled={busy || !report.writable || report.sufficient === false}
            onClick={async () => {
              if (
                !(await confirmAction(
                  `Create/use ${path}/aether-data for Aether-owned storage? Existing service storage will not change.`,
                  true,
                ))
              )
                return;
              setBusy(true);
              try {
                await onPrepared(await setupNative.prepare(path));
                setError("");
              } catch (e) {
                setError(String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Approve storage location
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
    </section>
  );
}
