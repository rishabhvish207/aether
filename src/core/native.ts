import { invoke } from "@tauri-apps/api/core";
export const isNative = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
export type DownloadProgress = {
  id: string;
  downloaded: number;
  total?: number;
  bytesPerSecond: number;
};
export const native = {
  chooseDirectory: () =>
    invoke<{ path: string; freeBytes: number } | null>(
      "choose_model_directory",
    ),
  useDirectory: (path: string) =>
    invoke<{ path: string; freeBytes: number }>("use_download_directory", {
      path,
    }),
  inspectGGUF: () =>
    invoke<{
      path: string;
      size: number;
      version: number;
      note: string;
    } | null>("inspect_gguf"),
  download: (id: string, url: string, filename: string, checksum?: string) =>
    invoke<string>("download_model", {
      id,
      url,
      filename,
      checksum: checksum || null,
    }),
  cancel: (id: string) => invoke<void>("cancel_download", { id }),
};
