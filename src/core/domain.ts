import { z } from "zod";
export const brand = { name: "Aether", version: "0.1.0" };
export const uid = () => crypto.randomUUID();
export const optionsSchema = z.object({
  temperature: z.number().min(0).max(2).default(0.7),
  top_p: z.number().min(0).max(1).default(0.9),
  top_k: z.number().int().min(0).default(40),
  min_p: z.number().min(0).max(1).default(0),
  num_ctx: z.number().int().min(256).max(1048576).default(4096),
  repeat_penalty: z.number().min(0).max(2).default(1.1),
  seed: z.number().int().default(0),
  stop: z.array(z.string()).default([]),
});
export type Options = z.infer<typeof optionsSchema>;
export const providerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(["ollama", "openai", "llamacpp", "lmstudio"]),
  baseUrl: z
    .string()
    .url()
    .refine(
      (v) => /^https?:/.test(v) && !new URL(v).username && !new URL(v).password,
      "Use HTTP(S) without embedded credentials",
    ),
  runtimeOwnership: z.enum(["external", "aether", "remote"]).optional(),
  enabled: z.boolean(),
  timeout: z.number().min(1000).max(600000),
});
export type Provider = z.infer<typeof providerSchema>;
export const profileSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100),
  description: z.string(),
  systemPrompt: z.string().max(100000),
  providerId: z.string().optional(),
  model: z.string().optional(),
  options: optionsSchema,
  outputStyle: z.string().default(""),
  capabilities: z
    .array(z.enum(["vision", "tools", "audio", "web"]))
    .default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Profile = z.infer<typeof profileSchema>;
export type Part = {
  type: "text" | "thinking" | "file" | "image" | "error" | "tool";
  text: string;
  name?: string;
  mime?: string;
};
export type Metrics = {
  ttftMs?: number;
  totalMs?: number;
  promptTokens?: number;
  outputTokens?: number;
  promptPerSecond?: number;
  outputPerSecond?: number;
  loadMs?: number;
};
export type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  parts: Part[];
  status: "complete" | "generating" | "stopped" | "error";
  createdAt: string;
  metrics?: Metrics;
};
export type Conversation = {
  id: string;
  title: string;
  providerId: string;
  model: string;
  profileId: string;
  temporary: boolean;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
  parentId?: string;
  pinned: boolean;
  folder: string;
};
export type Model = {
  id: string;
  size?: number;
  details?: Record<string, unknown>;
  capabilities?: string[];
};
export type Benchmark = {
  id: string;
  createdAt: string;
  provider: Provider;
  model: string;
  options: Options;
  prompt: string;
  suiteVersion: 1;
  mode: "warm" | "as-is";
  metrics: Metrics;
  error?: string;
};
export const settingsSchema = z.object({
  theme: z.enum(["dark", "light", "system"]).default("dark"),
  fontSize: z.number().min(12).max(24).default(15),
  density: z.enum(["comfortable", "compact"]).default("comfortable"),
  chatWidth: z.number().min(480).max(1400).default(850),
  reducedMotion: z.boolean().default(false),
  solid: z.boolean().default(false),
  contrast: z.boolean().default(false),
  showThinking: z.boolean().default(false),
  onboarded: z.boolean().default(false),
  modelDirectory: z.string().default(""),
  keepAlive: z.string().default("5m"),
  think: z.enum(["default", "on", "off"]).default("default"),
  options: optionsSchema.default(optionsSchema.parse({})),
});
export type Settings = z.infer<typeof settingsSchema>;
export const defaults = (): Settings => settingsSchema.parse({});
export function starters(): Profile[] {
  return [
    "General Assistant",
    "Coder",
    "Researcher",
    "Study Tutor",
    "Note Maker",
    "Writer",
    "Roleplay",
  ].map((name) => ({
    id: uid(),
    name,
    description: `Editable ${name.toLowerCase()} template`,
    systemPrompt: `You are a helpful ${name.toLowerCase()}. Be accurate and acknowledge uncertainty.`,
    options: optionsSchema.parse({}),
    outputStyle: "",
    capabilities: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
}
export const localProvider: Provider = {
  id: "local-ollama",
  name: "Local Ollama",
  kind: "ollama",
  baseUrl: "http://127.0.0.1:11434",
  enabled: true,
  timeout: 120000,
};
export function endpointScope(url: string): "local" | "LAN" | "remote" {
  const h = new URL(url).hostname;
  return ["localhost", "127.0.0.1", "[::1]"].includes(h)
    ? "local"
    : /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)
      ? "LAN"
      : "remote";
}
export const textOf = (m: Message) =>
  m.parts
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .join("");
export const partSchema = z.object({
  type: z.enum(["text", "thinking", "file", "image", "error", "tool"]),
  text: z.string().max(15000000),
  name: z.string().optional(),
  mime: z.string().optional(),
});
export const metricsSchema = z.object({
  ttftMs: z.number().optional(),
  totalMs: z.number().optional(),
  promptTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  promptPerSecond: z.number().optional(),
  outputPerSecond: z.number().optional(),
  loadMs: z.number().optional(),
});
export const messageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant", "system"]),
  parts: z.array(partSchema),
  status: z.enum(["complete", "generating", "stopped", "error"]),
  createdAt: z.string(),
  metrics: metricsSchema.optional(),
});
export const conversationSchema = z.object({
  id: z.string(),
  title: z.string(),
  providerId: z.string(),
  model: z.string(),
  profileId: z.string(),
  temporary: z.literal(false),
  messages: z.array(messageSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
  parentId: z.string().optional(),
  pinned: z.boolean(),
  folder: z.string(),
});
export const benchmarkSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  provider: providerSchema,
  model: z.string(),
  options: optionsSchema,
  prompt: z.string(),
  suiteVersion: z.literal(1),
  mode: z.enum(["warm", "as-is"]),
  metrics: metricsSchema,
  error: z.string().optional(),
});
