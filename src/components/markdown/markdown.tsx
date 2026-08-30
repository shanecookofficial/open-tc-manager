import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";

import { cn } from "@/lib/utils";

import { markdownSanitizeSchema } from "./sanitize-schema";

type MarkdownProps = {
  children: string;
  className?: string;
};

export function Markdown({ children, className }: MarkdownProps) {
  if (!children.trim()) {
    return null;
  }

  return (
    <div
      className={cn(
        "markdown prose prose-sm max-w-none text-foreground",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, markdownSanitizeSchema]]}
        components={{
          a: ({ href, children: linkChildren }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2 hover:text-primary/80"
            >
              {linkChildren}
            </a>
          ),
          table: ({ children: tableChildren }) => (
            <div className="my-2 overflow-x-auto">
              <table className="w-full border-collapse text-sm">{tableChildren}</table>
            </div>
          ),
          th: ({ children: thChildren }) => (
            <th className="border border-border bg-muted px-3 py-1.5 text-left font-medium">
              {thChildren}
            </th>
          ),
          td: ({ children: tdChildren }) => (
            <td className="border border-border px-3 py-1.5 align-top">{tdChildren}</td>
          ),
          pre: ({ children: preChildren }) => (
            <pre className="my-2 overflow-x-auto rounded-md bg-muted p-3 text-sm">
              {preChildren}
            </pre>
          ),
          code: ({ className: codeClassName, children: codeChildren }) => {
            const isBlock = Boolean(codeClassName);
            if (isBlock) {
              return <code className={codeClassName}>{codeChildren}</code>;
            }
            return (
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.875em]">
                {codeChildren}
              </code>
            );
          },
          ul: ({ children: ulChildren }) => (
            <ul className="my-2 list-disc space-y-1 pl-5">{ulChildren}</ul>
          ),
          ol: ({ children: olChildren }) => (
            <ol className="my-2 list-decimal space-y-1 pl-5">{olChildren}</ol>
          ),
          p: ({ children: pChildren }) => (
            <p className="my-1 leading-relaxed">{pChildren}</p>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
