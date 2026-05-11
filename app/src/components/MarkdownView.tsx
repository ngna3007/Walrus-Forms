import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";

import { cn } from "@/lib/utils";

export function MarkdownView({ src, className }: { src: string; className?: string }) {
  return (
    <div className={cn("prose-md", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
        {src || "_(empty)_"}
      </ReactMarkdown>
    </div>
  );
}
