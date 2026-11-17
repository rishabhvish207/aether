import { it, expect } from "vitest";
import {
  executeTool,
  relativePath,
  runAgent,
  type WorkspaceFiles,
  type AgentRun,
} from "../src/core/agents";
const files: WorkspaceFiles = {
  name: "test",
  list: async () => ["a.txt"],
  read: async () => "original",
  write: async () => {
    throw new Error("Unexpected write");
  },
};
it("blocks traversal, credentials and unknown/shell tools independently of model instructions", async () => {
  for (const path of [
    "../secret",
    "/etc/passwd",
    "a/../../x",
    "C:\\x",
    ".env",
    ".git/config",
    ".aws/credentials",
  ])
    expect(() => relativePath.parse(path)).toThrow();
  for (const name of ["shell", "toString", "__proto__"])
    await expect(
      executeTool(
        { id: "1", name, arguments: { command: "whoami" } },
        files,
        async () => true,
        new AbortController().signal,
      ),
    ).rejects.toThrow("blocked");
});
it("denied operations never execute", async () => {
  let called = false;
  await expect(
    executeTool(
      { id: "1", name: "read_file", arguments: { path: "a.txt" } },
      {
        ...files,
        read: async () => {
          called = true;
          return "x";
        },
      },
      async () => false,
      new AbortController().signal,
    ),
  ).rejects.toThrow("denied");
  expect(called).toBe(false);
});
it("rejects edits when original changed after approval", async () => {
  let reads = 0;
  await expect(
    executeTool(
      {
        id: "1",
        name: "write_file",
        arguments: { path: "a.txt", content: "replacement" },
      },
      { ...files, read: async () => (++reads === 1 ? "before" : "changed") },
      async () => true,
      new AbortController().signal,
    ),
  ).rejects.toThrow("changed after preview");
});
it("enforces iteration limits while retaining untrusted outputs as data", async () => {
  const run: AgentRun = {
    id: "1",
    createdAt: "now",
    providerId: "p",
    model: "m",
    workspace: "test",
    prompt: "test",
    events: [],
    status: "running",
    limits: { iterations: 1, seconds: 1, outputTokens: 100 },
  };
  await expect(
    runAgent({
      run,
      files,
      signal: new AbortController().signal,
      approve: async () => true,
      event: async (e) => {
        run.events.push(e);
      },
      turn: async () => ({
        content: "",
        calls: [{ id: "c", name: "read_file", arguments: { path: "a.txt" } }],
      }),
    }),
  ).rejects.toThrow("iteration limit");
  expect(run.events.map((e) => e.kind)).toEqual([
    "model",
    "proposal",
    "result",
  ]);
});
it("approval waits end when cancellation arrives", async () => {
  const controller = new AbortController();
  const pending = executeTool(
    { id: "1", name: "read_file", arguments: { path: "a.txt" } },
    files,
    () => new Promise(() => {}),
    controller.signal,
  );
  controller.abort(new Error("Cancelled"));
  await expect(pending).rejects.toThrow("Cancelled");
});
