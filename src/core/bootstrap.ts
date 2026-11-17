import { defaults, localProvider, starters, type Settings } from "./domain";
import type { Store } from "./storage";
const pending = new WeakMap<Store, Promise<void>>();
export function initializeStore(store: Store): Promise<void> {
  const existing = pending.get(store);
  if (existing) return existing;
  const task = (async () => {
    if (await store.get<Settings>("settings", "app")) return;
    const ps = await store.list("providers");
    if (!ps.length) await store.put("providers", localProvider);
    const profiles = await store.list("profiles");
    if (!profiles.length)
      for (const profile of starters()) await store.put("profiles", profile);
    await store.put("settings", { ...defaults(), id: "app" });
  })();
  pending.set(store, task);
  task.catch(() => pending.delete(store));
  return task;
}
