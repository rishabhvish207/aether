"use client";
import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { native, isNative, type DownloadProgress } from "@/core/native";
import { uid } from "@/core/domain";
import { HuggingFaceSearch } from "./huggingface";
export function Downloads() {
  const [directory, setDirectory] = useState<{
    path: string;
    freeBytes: number;
  } | null>(null);
  const [url, setUrl] = useState("");
  const [filename, setFilename] = useState("");
  const [checksum, setChecksum] = useState("");
  const [progress, setProgress] = useState<DownloadProgress>();
  const [job, setJob] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!isNative()) return;
    const pending = listen<DownloadProgress>("download-progress", (e) =>
      setProgress(e.payload),
    );
    return () => {
      void pending.then((unlisten) => unlisten());
    };
  }, []);
  return (
    <section className="card stack">
      <h2>GGUF source files</h2>
      <HuggingFaceSearch
        select={(url, name, hash) => {
          setUrl(url);
          setFilename(name);
          setChecksum(hash);
          setMessage("File selected. Use the native download form below.");
        }}
      />
      <p className="muted">
        Original GGUFs remain separate from runtime weights. Native downloads
        stream to a dedicated, explicitly selected folder. Existing files are
        never overwritten.
      </p>
      {!isNative() ? (
        <div className="notice">
          Use the native desktop build for direct GGUF downloads and local-file
          inspection. Browser preview cannot safely stream multi-GB models to an
          arbitrary filesystem path. Provider registry pulls above work through
          Ollama.
        </div>
      ) : (
        <>
          <div className="row">
            <button
              disabled={!!job}
              onClick={async () => {
                try {
                  setDirectory(await native.chooseDirectory());
                } catch (e) {
                  setMessage(String(e));
                }
              }}
            >
              Choose model folder
            </button>
            <button
              disabled={!!job}
              onClick={async () => {
                try {
                  const file = await native.inspectGGUF();
                  if (file) setMessage(JSON.stringify(file, null, 2));
                } catch (e) {
                  setMessage(String(e));
                }
              }}
            >
              Inspect existing GGUF
            </button>
          </div>
          {directory && (
            <p>
              {directory.path} · {(directory.freeBytes / 1e9).toFixed(1)} GB
              free at selection time
            </p>
          )}
          <label>
            Direct HTTPS file URL
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </label>
          <label>
            Filename (.gguf)
            <input
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
            />
          </label>
          <label>
            Expected SHA-256 (optional)
            <input
              value={checksum}
              onChange={(e) => setChecksum(e.target.value)}
            />
          </label>
          <p className="muted">
            Size is checked against available space when the server supplies
            Content-Length. Unknown sizes may exhaust storage. Cancellation
            retains a uniquely named partial file; resume is not implemented.
          </p>
          {job ? (
            <button onClick={() => void native.cancel(job)}>
              Cancel download
            </button>
          ) : (
            <button
              disabled={!directory || !url || !filename}
              onClick={async () => {
                if (
                  !confirm(
                    `Download from ${url} into ${directory?.path}/${filename}? Size may be unknown until connected.`,
                  )
                )
                  return;
                const id = uid();
                setJob(id);
                setProgress(undefined);
                try {
                  setMessage(
                    await native.download(id, url, filename, checksum),
                  );
                } catch (e) {
                  setMessage(String(e));
                } finally {
                  setJob("");
                }
              }}
            >
              Download source file
            </button>
          )}
          {progress && (
            <p role="status">
              {(progress.downloaded / 1e6).toFixed(1)} MB{" "}
              {progress.total
                ? `/ ${(progress.total / 1e6).toFixed(1)} MB`
                : ""}{" "}
              · {(progress.bytesPerSecond / 1e6).toFixed(1)} MB/s
            </p>
          )}
          <pre style={{ whiteSpace: "pre-wrap" }} role="status">
            {message}
          </pre>
        </>
      )}
    </section>
  );
}
