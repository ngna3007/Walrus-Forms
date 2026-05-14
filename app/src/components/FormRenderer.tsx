import { useRef, useState } from "react";
import { Star, Upload, Loader2, Check, Bold, Italic, Underline, Strikethrough, Link as LinkIcon, ListOrdered, List, Quote, Code, Code2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input, Textarea, Label } from "@/components/ui/input";
import { cn, truncateBlob } from "@/lib/utils";
import { storeBlob } from "@/walrus/client";
import type { FormField, FormSchema, SubmissionPayload, SubmissionValue } from "@/forms/types";

export interface FormRendererProps {
  schema: FormSchema;
  formId: string;
  submitter?: string;
  submitterRequired?: boolean;
  footerNote?: string;
  onSubmit: (payload: SubmissionPayload, fileBlobIds: string[]) => Promise<void>;
}

type SubmitState = "idle" | "signing" | "submitting" | "done" | "error";

export function FormRenderer({
  schema,
  formId,
  submitter,
  submitterRequired = false,
  footerNote,
  onSubmit,
}: FormRendererProps) {
  const [values, setValues] = useState<Record<string, SubmissionValue>>({});
  const [state, setState] = useState<SubmitState>("idle");
  const [error, setError] = useState<string | null>(null);

  function setValue(id: string, value: SubmissionValue) {
    setValues((v) => ({ ...v, [id]: value }));
  }

  function submitAnotherResponse() {
    setValues({});
    setError(null);
    setState("idle");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    for (const f of schema.fields) {
      if (!f.required) continue;
      const v = values[f.id];
      // Treat as missing if undefined, empty string, empty array, or 0-star rating.
      const missing =
        v === undefined ||
        (v.type === "text" && v.value.trim() === "") ||
        (v.type === "url" && v.value.trim() === "") ||
        (v.type === "dropdown" && v.value === "") ||
        (v.type === "checkbox" && v.value.length === 0) ||
        (v.type === "stars" && v.value <= 0);
      if (missing) {
        setError(`Required: ${f.label}`);
        return;
      }
    }

    if (submitterRequired && !submitter) {
      setError("Connect a wallet to submit this form.");
      return;
    }

    setState("signing");
    try {
      const fileBlobIds: string[] = [];
      for (const v of Object.values(values)) {
        if (v.type === "file") fileBlobIds.push(v.blobId);
      }

      setState("submitting");
      await onSubmit(
        { version: 1, formId, submitter, submittedAt: Date.now(), values },
        fileBlobIds,
      );
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState("error");
    }
  }

  const submitLabel = {
    idle: "Submit",
    signing: "Sign in wallet…",
    submitting: "Submitting...",
    done: "Submitted",
    error: "Try again",
  }[state];

  if (state === "done") {
    return (
      <div className="flex flex-col gap-6 p-6">
        <div className="rounded-2xl border border-primary/25 bg-primary/10 px-5 py-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-2xl font-semibold">Your response has been recorded.</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
            You can submit another response if you need to add more feedback.
          </p>
        </div>

        <Button type="button" size="lg" variant="secondary" onClick={submitAnotherResponse}>
          Submit another response
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6 p-6">
      <div>
        <h2 className="font-serif italic text-3xl tracking-tight">{schema.title}</h2>
        {schema.description && (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{schema.description}</p>
        )}
      </div>

      <div className="flex flex-col gap-5">
        {schema.fields.map((field) => (
          <FieldInput
            key={field.id}
            field={field}
            value={values[field.id]}
            onChange={(v) => setValue(field.id, v)}
          />
        ))}
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <Button
        type="submit"
        size="lg"
        disabled={state === "signing" || state === "submitting"}
        leftIcon={
          state === "signing" || state === "submitting" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : undefined
        }
        variant="primary"
      >
        {submitLabel}
      </Button>
      {footerNote && <p className="text-center text-xs text-muted-foreground">{footerNote}</p>}
    </form>
  );
}

type WrapAction =
  | { kind: "wrap"; before: string; after: string; placeholder: string }
  | { kind: "linePrefix"; prefix: string }
  | { kind: "link" }
  | { kind: "codeblock" };

function RichTextField({
  field,
  labelEl,
  value,
  onChange,
}: {
  field: FormField;
  labelEl: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
}) {
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  function apply(action: WrapAction) {
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.slice(start, end);
    let nextValue = value;
    let nextStart = start;
    let nextEnd = end;

    if (action.kind === "wrap") {
      const inner = selected || action.placeholder;
      nextValue = value.slice(0, start) + action.before + inner + action.after + value.slice(end);
      nextStart = start + action.before.length;
      nextEnd = nextStart + inner.length;
    } else if (action.kind === "linePrefix") {
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      const lineEnd = value.indexOf("\n", end);
      const sliceEnd = lineEnd === -1 ? value.length : lineEnd;
      const block = value.slice(lineStart, sliceEnd);
      const prefixed = block
        .split("\n")
        .map((line, i) => {
          const p = action.prefix === "1. " ? `${i + 1}. ` : action.prefix;
          return line ? `${p}${line}` : p.trimEnd();
        })
        .join("\n");
      nextValue = value.slice(0, lineStart) + prefixed + value.slice(sliceEnd);
      nextStart = lineStart;
      nextEnd = lineStart + prefixed.length;
    } else if (action.kind === "link") {
      const label = selected || "text";
      const inserted = `[${label}](https://)`;
      nextValue = value.slice(0, start) + inserted + value.slice(end);
      nextStart = start + label.length + 3; // inside the URL
      nextEnd = nextStart + 8;
    } else if (action.kind === "codeblock") {
      const inner = selected || "code";
      const block = `\n\`\`\`\n${inner}\n\`\`\`\n`;
      nextValue = value.slice(0, start) + block + value.slice(end);
      nextStart = start + 5;
      nextEnd = nextStart + inner.length;
    }

    onChange(nextValue);
    requestAnimationFrame(() => {
      const el = taRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(nextStart, nextEnd);
    });
  }

  const buttons: { icon: typeof Bold; title: string; action: WrapAction; sep?: boolean }[] = [
    { icon: Bold, title: "Bold", action: { kind: "wrap", before: "**", after: "**", placeholder: "bold" } },
    { icon: Italic, title: "Italic", action: { kind: "wrap", before: "*", after: "*", placeholder: "italic" } },
    { icon: Underline, title: "Underline", action: { kind: "wrap", before: "<u>", after: "</u>", placeholder: "underline" } },
    { icon: Strikethrough, title: "Strikethrough", action: { kind: "wrap", before: "~~", after: "~~", placeholder: "strike" } },
    { icon: LinkIcon, title: "Link", action: { kind: "link" }, sep: true },
    { icon: ListOrdered, title: "Numbered list", action: { kind: "linePrefix", prefix: "1. " } },
    { icon: List, title: "Bulleted list", action: { kind: "linePrefix", prefix: "- " } },
    { icon: Quote, title: "Quote", action: { kind: "linePrefix", prefix: "> " }, sep: true },
    { icon: Code, title: "Inline code", action: { kind: "wrap", before: "`", after: "`", placeholder: "code" } },
    { icon: Code2, title: "Code block", action: { kind: "codeblock" } },
  ];

  return (
    <div className="flex flex-col gap-1.5">
      {labelEl}
      <div className="rounded-lg border border-border bg-background-soft overflow-hidden">
        <div className="flex items-center gap-0.5 px-1.5 py-1 border-b border-border/60">
          {buttons.map((b) => (
            <span key={b.title} className="inline-flex items-center">
              <button
                type="button"
                title={b.title}
                onClick={() => apply(b.action)}
                className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
              >
                <b.icon className="h-3.5 w-3.5" />
              </button>
              {b.sep && <span className="h-4 w-px bg-border/60 mx-0.5" />}
            </span>
          ))}
        </div>
        <Textarea
          ref={taRef}
          rows={6}
          className="border-0 rounded-none bg-transparent focus:ring-0"
          placeholder={field.helpText ?? ""}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value: SubmissionValue | undefined;
  onChange: (v: SubmissionValue) => void;
}) {
  const labelEl = (
    <Label>
      {field.label}
      {field.required && <span className="ml-1 text-destructive">*</span>}
    </Label>
  );

  switch (field.type) {
    case "shortText":
      return (
        <div className="flex flex-col gap-1.5">
          {labelEl}
          <Input
            value={value?.type === "text" ? value.value : ""}
            onChange={(e) => onChange({ type: "text", value: e.target.value })}
          />
        </div>
      );
    case "longText":
      return (
        <div className="flex flex-col gap-1.5">
          {labelEl}
          <Textarea
            rows={5}
            value={value?.type === "text" ? value.value : ""}
            onChange={(e) => onChange({ type: "text", value: e.target.value })}
          />
        </div>
      );
    case "richText":
      return (
        <RichTextField
          field={field}
          labelEl={labelEl}
          value={value?.type === "text" ? value.value : ""}
          onChange={(v) => onChange({ type: "text", value: v })}
        />
      );
    case "url":
      return (
        <div className="flex flex-col gap-1.5">
          {labelEl}
          <Input
            type="url"
            placeholder="https://"
            value={value?.type === "url" ? value.value : ""}
            onChange={(e) => onChange({ type: "url", value: e.target.value })}
          />
        </div>
      );
    case "dropdown":
      return (
        <div className="flex flex-col gap-1.5">
          {labelEl}
          <select
            className="h-10 rounded-lg bg-background-soft border border-border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring/60"
            value={value?.type === "dropdown" ? value.value : ""}
            onChange={(e) => onChange({ type: "dropdown", value: e.target.value })}
          >
            <option value="">— Select —</option>
            {(field.options ?? []).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
      );
    case "checkbox":
      return (
        <fieldset className="flex flex-col gap-2">
          <Label>{field.label}</Label>
          {(field.options ?? []).map((o) => {
            const selected = value?.type === "checkbox" ? value.value.includes(o) : false;
            return (
              <label key={o} className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="accent-primary"
                  checked={selected}
                  onChange={(e) => {
                    const prev = value?.type === "checkbox" ? value.value : [];
                    const next = e.target.checked ? [...prev, o] : prev.filter((x) => x !== o);
                    onChange({ type: "checkbox", value: next });
                  }}
                />
                {o}
              </label>
            );
          })}
        </fieldset>
      );
    case "stars": {
      const max = field.max ?? 5;
      const current = value?.type === "stars" ? value.value : 0;
      return (
        <div className="flex flex-col gap-1.5">
          {labelEl}
          <div className="flex items-center gap-1">
            {Array.from({ length: max }, (_, i) => i + 1).map((n) => {
              const filled = n <= current;
              return (
                <button
                  type="button"
                  key={n}
                  onClick={() => onChange({ type: "stars", value: n })}
                  aria-label={`${n} stars`}
                  className="p-1 rounded transition-colors"
                >
                  <Star
                    className={cn(
                      "h-6 w-6 transition-colors",
                      filled ? "fill-secondary-strong text-secondary-strong dark:fill-secondary dark:text-secondary" : "text-muted-foreground/40",
                    )}
                  />
                </button>
              );
            })}
          </div>
        </div>
      );
    }
    case "screenshot":
    case "video": {
      const accept = field.type === "screenshot" ? "image/*" : "video/*";
      return (
        <div className="flex flex-col gap-1.5">
          {labelEl}
          <label className="cursor-pointer">
            <input
              type="file"
              className="sr-only"
              accept={accept}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const buf = new Uint8Array(await file.arrayBuffer());
                  const { blobId } = await storeBlob(buf);
                  onChange({ type: "file", blobId, mimeType: file.type, encrypted: false });
                } catch (err) {
                  alert(`Upload failed: ${err instanceof Error ? err.message : String(err)}`);
                }
              }}
            />
            <div
              className={cn(
                "rounded-xl border border-dashed border-border bg-background-soft px-4 py-6 flex flex-col items-center gap-2 text-muted-foreground transition-all",
                "hover:border-primary/40 hover:text-primary",
              )}
            >
              <Upload className="h-5 w-5" />
              <div className="text-sm">
                Click to upload {field.type === "screenshot" ? "image" : "video"}
              </div>
              {value?.type === "file" && (
                <div className="font-mono text-xs text-secondary-strong dark:text-secondary inline-flex items-center gap-1.5">
                  <Check className="h-3 w-3" />
                  {truncateBlob(value.blobId, 16)}
                </div>
              )}
            </div>
          </label>
        </div>
      );
    }
  }
}
