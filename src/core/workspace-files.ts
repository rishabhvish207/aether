import { relativePath, type WorkspaceFiles } from "./agents";
interface DirectoryHandle {
  name: string;
  getDirectoryHandle(name: string): Promise<DirectoryHandle>;
  getFileHandle(
    name: string,
    options?: { create: boolean },
  ): Promise<WritableFileHandle>;
  values(): AsyncIterable<{ name: string; kind: string }>;
}
interface WritableFileHandle {
  getFile(): Promise<File>;
  createWritable(): Promise<{
    write(content: string): Promise<void>;
    close(): Promise<void>;
    abort(): Promise<void>;
  }>;
}
export function supportsWorkspacePicker() {
  return "showDirectoryPicker" in window;
}
export async function pickWorkspace(): Promise<WorkspaceFiles> {
  const picker = (
    window as unknown as {
      showDirectoryPicker: (o: { mode: string }) => Promise<DirectoryHandle>;
    }
  ).showDirectoryPicker;
  if (!picker)
    throw new Error(
      "This platform does not expose a workspace directory picker",
    );
  const root = await picker.call(window, { mode: "readwrite" });
  async function parent(path: string) {
    relativePath.parse(path);
    const parts = path.split("/");
    const name = parts.pop()!;
    let dir = root;
    for (const part of parts) dir = await dir.getDirectoryHandle(part);
    return { dir, name };
  }
  return {
    name: root.name,
    async list(path) {
      let dir = root;
      if (path) {
        relativePath.parse(path);
        for (const p of path.split("/")) dir = await dir.getDirectoryHandle(p);
      }
      const entries = [];
      for await (const e of dir.values()) {
        if (entries.length >= 500) break;
        if (!e.name.startsWith(".")) entries.push(`${e.kind}: ${e.name}`);
      }
      return entries;
    },
    async read(path) {
      const { dir, name } = await parent(path);
      const file = await (await dir.getFileHandle(name)).getFile();
      if (file.size > 100000) throw new Error("File exceeds 100 KB tool limit");
      const text = await file.text();
      if (text.includes("\0")) throw new Error("Binary files are blocked");
      return text;
    },
    async write(path, content) {
      const { dir, name } = await parent(path);
      const writer = await (
        await dir.getFileHandle(name, { create: true })
      ).createWritable();
      try {
        await writer.write(content);
        await writer.close();
      } catch (e) {
        await writer.abort();
        throw e;
      }
    },
  };
}
