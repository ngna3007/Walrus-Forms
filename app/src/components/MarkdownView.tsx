import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";

import { cn } from "@/lib/utils";

// Extend the default schema so the rich-text toolbar's <u> tag survives the
// sanitize pass (defaultSchema strips it). Everything else stays whitelisted as
// before — no scripts, no inline event handlers.
const schema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "u"],
};

export function MarkdownView({ src, className }: { src: string; className?: string }) {
  return (
    <div className={cn("prose-md", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, schema]]}
      >
        {src || "_(empty)_"}
      </ReactMarkdown>
    </div>
  );
}
