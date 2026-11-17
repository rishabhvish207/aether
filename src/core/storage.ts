import { openDB, type IDBPDatabase } from "idb";
export interface Store {
  get<T>(collection: string, id: string): Promise<T | undefined>;
  list<T>(collection: string): Promise<T[]>;
  put<T extends { id: string }>(collection: string, value: T): Promise<void>;
  remove(collection: string, id: string): Promise<void>;
}
export const collections = [
  "settings",
  "providers",
  "profiles",
  "conversations",
  "benchmarks",
  "research",
  "themes",
  "agentRuns",
  "models",
  "setup",
] as const;
export class BrowserStore implements Store {
  private db: Promise<IDBPDatabase>;
  constructor(name = "aether") {
    this.db = openDB(name, 1, {
      upgrade(db) {
        db.createObjectStore("records", { keyPath: "key" });
      },
    });
  }
  async get<T>(collection: string, id: string): Promise<T | undefined> {
    return (await (await this.db).get("records", `${collection}:${id}`))?.value;
  }
  async list<T>(collection: string): Promise<T[]> {
    return (
      await (
        await this.db
      ).getAll(
        "records",
        IDBKeyRange.bound(`${collection}:`, `${collection}:\uffff`),
      )
    ).map((r) => r.value);
  }
  async put<T extends { id: string }>(collection: string, value: T) {
    await (
      await this.db
    ).put("records", { key: `${collection}:${value.id}`, value });
  }
  async remove(collection: string, id: string) {
    await (await this.db).delete("records", `${collection}:${id}`);
  }
}
export class NativeStore implements Store {
  private db = import("@tauri-apps/plugin-sql").then(
    async ({ default: Database }) => {
      const db = await Database.load("sqlite:aether.db");
      await db.execute(
        "CREATE TABLE IF NOT EXISTS records (collection TEXT NOT NULL, id TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(collection,id))",
      );
      return db;
    },
  );
  async get<T>(c: string, id: string): Promise<T | undefined> {
    const rows = await (
      await this.db
    ).select<{ value: string }[]>(
      "SELECT value FROM records WHERE collection=$1 AND id=$2",
      [c, id],
    );
    return rows[0] ? JSON.parse(rows[0].value) : undefined;
  }
  async list<T>(c: string): Promise<T[]> {
    return (
      await (
        await this.db
      ).select<{ value: string }[]>(
        "SELECT value FROM records WHERE collection=$1",
        [c],
      )
    ).map((r) => JSON.parse(r.value));
  }
  async put<T extends { id: string }>(c: string, v: T) {
    await (
      await this.db
    ).execute(
      "INSERT INTO records VALUES ($1,$2,$3) ON CONFLICT(collection,id) DO UPDATE SET value=excluded.value",
      [c, v.id, JSON.stringify(v)],
    );
  }
  async remove(c: string, id: string) {
    await (
      await this.db
    ).execute("DELETE FROM records WHERE collection=$1 AND id=$2", [c, id]);
  }
}
let instance: Store | undefined;
export function createStore(): Store {
  return (instance ??=
    "__TAURI_INTERNALS__" in window ? new NativeStore() : new BrowserStore());
}
export async function saveConversation(
  store: Store,
  c: import("./domain").Conversation,
) {
  if (!c.temporary) await store.put("conversations", c);
}
