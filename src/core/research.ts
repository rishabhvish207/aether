import { z } from "zod";
import { uid } from "./domain";
export type Source = {
  id: string;
  title: string;
  url: string;
  excerpt: string;
  retrievedAt: string;
};
export type ResearchWorkspace = {
  id: string;
  title: string;
  sources: Source[];
  notes: string;
  createdAt: string;
  updatedAt: string;
};
function safeUrl(raw: string) {
  const url = new URL(raw);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("Use an HTTP(S) source without embedded credentials");
  return url;
}
const resultSchema = z.object({
  results: z.array(
    z.object({
      title: z.string(),
      url: z.string(),
      content: z.string().optional(),
    }),
  ),
});
export async function searchWeb(
  endpoint: string,
  query: string,
  signal: AbortSignal,
): Promise<Source[]> {
  const url = safeUrl(endpoint);
  url.pathname = url.pathname.replace(/\/$/, "") + "/search";
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  const response = await fetch(url, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
  });
  if (!response.ok)
    throw new Error(
      `Search HTTP ${response.status}; the SearXNG instance must enable JSON and allow this origin`,
    );
  const data = resultSchema.parse(await response.json());
  return data.results.slice(0, 20).flatMap((r) => {
    try {
      return [
        {
          id: uid(),
          title: r.title,
          url: safeUrl(r.url).toString(),
          excerpt: r.content ?? "",
          retrievedAt: new Date().toISOString(),
        },
      ];
    } catch {
      return [];
    }
  });
}
export async function extractSource(
  url: string,
  signal: AbortSignal,
): Promise<Source> {
  const parsed = safeUrl(url);
  const r = await fetch(parsed, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
  });
  if (!r.ok) throw new Error(`Source HTTP ${r.status}`);
  if (!r.headers.get("content-type")?.includes("text/html"))
    throw new Error("Source is not an HTML document");
  const reader = r.body?.getReader();
  if (!reader) throw new Error("Empty source");
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 2e6) throw new Error("Source exceeds 2 MB extraction limit");
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    await reader.cancel();
  }
  const doc = new DOMParser().parseFromString(text, "text/html");
  doc
    .querySelectorAll("script,style,nav,footer,header,iframe,form")
    .forEach((el) => el.remove());
  const excerpt =
    (doc.querySelector("article,main") ?? doc.body).textContent
      ?.replace(/\s+/g, " ")
      .trim()
      .slice(0, 30000) ?? "";
  if (!excerpt) throw new Error("No readable content found");
  return {
    id: uid(),
    title: doc.title || parsed.hostname,
    url: parsed.toString(),
    excerpt,
    retrievedAt: new Date().toISOString(),
  };
}
export function researchReport(w: ResearchWorkspace) {
  return (
    `# ${w.title}\n\n## User notes / synthesis\n\n${w.notes}\n\n## Retrieved sources (untrusted excerpts)\n\n` +
    w.sources
      .map(
        (s, i) =>
          `### [${i + 1}] ${s.title}\n${s.url}\nRetrieved ${s.retrievedAt}\n\n${s.excerpt}`,
      )
      .join("\n\n")
  );
}
