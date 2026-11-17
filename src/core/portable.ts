import { setupSchema } from "./setup";
import { z } from "zod";
import {
  profileSchema,
  providerSchema,
  settingsSchema,
  conversationSchema,
  benchmarkSchema,
  type Conversation,
  textOf,
} from "./domain";
import { collections, type Store } from "./storage";
export function download(
  name: string,
  content: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function exportConversation(
  c: Conversation,
  format: "json" | "md" | "txt",
  thinking = false,
) {
  const clean = {
    ...c,
    messages: c.messages.map((m) => ({
      ...m,
      parts: m.parts.filter(
        (p) => p.type === "text" || (thinking && p.type === "thinking"),
      ),
    })),
  };
  return format === "json"
    ? JSON.stringify(
        {
          schemaVersion: 1,
          includes: { thinking, attachments: false, tools: false },
          conversation: clean,
        },
        null,
        2,
      )
    : `# ${c.title}\n\nExport includes thinking: ${thinking}; attachments: no; tool activity: no.\n\n` +
        clean.messages
          .map(
            (m) =>
              `## ${m.role}\n\n${textOf(m)}${
                thinking
                  ? m.parts
                      .filter((p) => p.type === "thinking")
                      .map((p) => `\n\nThinking:\n${p.text}`)
                      .join("")
                  : ""
              }`,
          )
          .join("\n\n");
}
const recordSchema = z.object({ id: z.string().min(1) }).passthrough();
const backupSchema = z.object({
  schemaVersion: z.literal(1),
  createdAt: z.string(),
  sections: z.record(z.string(), z.array(recordSchema)),
  checksums: z.record(z.string(), z.string()),
});
export type Backup = z.infer<typeof backupSchema>;
// Stable key ordering prevents schema-normalization from invalidating otherwise identical records.
function canonicalJSON(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((key) => [key, v[key]]),
        )
      : v,
  );
}
async function sha(text: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
    ),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export async function makeBackup(
  store: Store,
  selected: readonly string[],
): Promise<Backup> {
  const sections: Backup["sections"] = {};
  const checksums: Record<string, string> = {};
  for (const key of selected) {
    if (!collections.includes(key as (typeof collections)[number]))
      throw new Error("Unknown backup section");
    sections[key] = (await store.list<{ id: string }>(key)).map((v) =>
      sanitizeRecord(key, v),
    );
    checksums[key] = await sha(canonicalJSON(sections[key]));
  }
  return {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    sections,
    checksums,
  };
}
export async function validateBackup(input: unknown): Promise<Backup> {
  const b = backupSchema.parse(input);
  const rawSections = z
    .object({ sections: z.record(z.string(), z.unknown()) })
    .parse(input).sections;
  for (const [key, values] of Object.entries(b.sections)) {
    if (!collections.includes(key as (typeof collections)[number]))
      throw new Error(`Unsupported section: ${key}`);
    if (
      (await sha(canonicalJSON(values))) !== b.checksums[key] &&
      (await sha(JSON.stringify(rawSections[key]))) !== b.checksums[key]
    )
      throw new Error(`Checksum mismatch: ${key}`);
    const ids = new Set();
    for (const v of values) {
      if (ids.has(v.id)) throw new Error("Duplicate record ID");
      ids.add(v.id);
      sanitizeRecord(key, v);
    }
  }
  return b;
}
export async function restoreBackup(
  store: Store,
  b: Backup,
  overwrite = false,
  selected = Object.keys(b.sections),
) {
  await validateBackup(b);
  for (const section of selected) {
    for (const record of b.sections[section] ?? []) {
      if (!overwrite && (await store.get(section, record.id))) continue;
      await store.put(section, sanitizeRecord(section, record));
    }
  }
}
export function parseProfiles(input: unknown) {
  return z
    .object({
      schemaVersion: z.literal(1),
      profiles: z.array(profileSchema).max(500),
    })
    .parse(input).profiles;
}

function sanitizeRecord(section: string, input: unknown): { id: string } {
  if (section === "setup")
    return setupSchema.extend({ id: z.literal("current") }).parse(input);
  if (section === "profiles") return profileSchema.parse(input);
  if (section === "providers") return providerSchema.parse(input);
  if (section === "settings")
    return settingsSchema.extend({ id: z.literal("app") }).parse(input);
  if (section === "conversations") return conversationSchema.parse(input);
  if (section === "benchmarks") return benchmarkSchema.parse(input);
  if (section === "research")
    return z
      .object({
        id: z.string(),
        title: z.string(),
        notes: z.string(),
        createdAt: z.string(),
        updatedAt: z.string(),
        sources: z.array(
          z.object({
            id: z.string(),
            title: z.string(),
            url: z
              .string()
              .url()
              .refine((v) => /^https?:/.test(v)),
            excerpt: z.string(),
            retrievedAt: z.string(),
          }),
        ),
      })
      .parse(input);
  if (section === "agentRuns")
    return z
      .object({
        id: z.string(),
        createdAt: z.string(),
        status: z.enum(["running", "complete", "cancelled", "error"]),
        events: z.array(
          z.object({
            id: z.string(),
            at: z.string(),
            kind: z.enum(["model", "proposal", "result", "error", "finished"]),
            text: z.string(),
            call: z
              .object({
                id: z.string(),
                name: z.string(),
                arguments: z.unknown(),
              })
              .optional(),
          }),
        ),
        providerId: z.string(),
        model: z.string(),
        prompt: z.string(),
        workspace: z.string(),
        limits: z.object({
          iterations: z.number().min(1).max(20),
          seconds: z.number().min(1).max(3600),
          outputTokens: z.number().min(1).max(100000),
        }),
      })
      .parse(input);
  throw new Error(
    `Import/export of non-empty ${section} records is not supported by this schema version`,
  );
}
