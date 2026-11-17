"use client";
import { memo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
function CodeBlock({ children }: { children?: React.ReactNode }) {
  const ref = useRef<HTMLPreElement>(null);
  const [status, setStatus] = useState("Copy code");
  return (
    <div>
      <pre ref={ref}>{children}</pre>
      <button
        onClick={() =>
          void navigator.clipboard
            .writeText(ref.current?.textContent ?? "")
            .then(() => setStatus("Copied"))
            .catch(() => setStatus("Clipboard unavailable"))
        }
      >
        {status}
      </button>
    </div>
  );
}
export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          pre: CodeBlock,
          img: ({ src, alt }) => (
            <a
              href={typeof src === "string" ? src : undefined}
              target="_blank"
              rel="noreferrer"
            >
              {alt || "External image"} (open image; may contact external
              website)
            </a>
          ),
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});
