import { z } from "zod";
const modelSchema = z.object({
  id: z.string(),
  gated: z.union([z.boolean(), z.string()]).optional(),
  private: z.boolean().optional(),
});
export async function searchModels(query: string, signal: AbortSignal) {
  const u = new URL("https://huggingface.co/api/models");
  u.searchParams.set("search", query);
  u.searchParams.set("filter", "gguf");
  u.searchParams.set("limit", "20");
  const r = await fetch(u, { signal });
  if (!r.ok) throw new Error(`Hugging Face search HTTP ${r.status}`);
  return z.array(modelSchema).parse(await r.json());
}
export const repoSchema = z.object({
  id: z.string(),
  sha: z.string(),
  gated: z.union([z.boolean(), z.string()]).optional(),
  cardData: z
    .object({ license: z.string().optional() })
    .passthrough()
    .optional(),
  siblings: z.array(
    z.object({
      rfilename: z.string(),
      size: z.number().optional(),
      lfs: z.object({ sha256: z.string(), size: z.number() }).optional(),
    }),
  ),
});
export async function repoFiles(id: string, signal: AbortSignal) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(id)) throw new Error("Use owner/repository");
  const r = await fetch(`https://huggingface.co/api/models/${id}?blobs=true`, {
    signal,
  });
  if (!r.ok)
    throw new Error(
      `Repository HTTP ${r.status}; private/gated authentication is not yet supported`,
    );
  return repoSchema.parse(await r.json());
}
export function resolvedFileUrl(
  repo: string,
  revision: string,
  filename: string,
) {
  if (
    !/^[\w.-]+\/[\w.-]+$/.test(repo) ||
    !revision ||
    filename.split("/").some((p) => !p || p === "." || p === "..") ||
    filename.includes("\\")
  )
    throw new Error("Invalid repository file");
  return `https://huggingface.co/${repo}/resolve/${encodeURIComponent(revision)}/${filename.split("/").map(encodeURIComponent).join("/")}`;
}
