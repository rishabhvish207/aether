import { invoke } from "@tauri-apps/api/core";
export type StorageReport = {
  path: string;
  exists: boolean;
  mount?: string;
  filesystem?: string;
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  writable: boolean;
  requiredBytes?: number;
  sufficient?: boolean;
  warnings: string[];
};
export type StorageLayout = {
  root: string;
  models: string;
  downloads: string;
  imports: string;
  report: StorageReport;
};
export type ManagedConfig = {
  binary: string;
  layout: StorageLayout;
  endpoint: string;
};
export type RuntimeEnvironment = {
  appData: string;
  defaultStorage: string;
  automaticInstall: boolean;
  existing: {
    binary?: string;
    serviceRunning: boolean;
    endpoint?: string;
    modelDirectory?: string;
    configurationSource: string;
  };
  managed?: ManagedConfig;
};
export type RuntimeRelease = {
  version: string;
  url: string;
  sha256: string;
  bytes: number;
};
export const setupNative = {
  usage: (path: string) =>
    invoke<{
      files: number;
      apparentBytes: number;
      partialFiles: string[];
      skippedEntries: number;
      incomplete: boolean;
    }>("storage_usage", { path }),
  starterModels: () =>
    invoke<{ name: string; bytes: number; source: string }[]>("starter_models"),
  environment: () => invoke<RuntimeEnvironment>("setup_environment"),
  inspect: (path: string, requiredBytes?: number) =>
    invoke<StorageReport>("inspect_storage", {
      path,
      requiredBytes: requiredBytes ?? null,
    }),
  choose: () => invoke<string | null>("pick_storage_location"),
  prepare: (path: string) =>
    invoke<StorageLayout>("prepare_storage", { path, consent: true }),
  release: () => invoke<RuntimeRelease>("runtime_release"),
  install: () => invoke<string>("install_runtime", { consent: true }),
  cancelInstall: () => invoke<void>("cancel_runtime_install"),
  start: (layout: StorageLayout, useExistingBinary: boolean) =>
    invoke<ManagedConfig>("start_managed_runtime", {
      layout,
      useExistingBinary,
      consent: true,
    }),
  stop: () => invoke<void>("stop_managed_runtime", { consent: true }),
};
