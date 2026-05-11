import { useState } from "react";
import { Star, Upload, Loader2, Check, Eye, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input, Textarea, Label } from "@/components/ui/input";
import { MarkdownView } from "@/components/MarkdownView";
import { cn, truncateBlob } from "@/lib/utils";
import { storeBlob } from "@/walrus/client";
import type { FormField, FormSchema, SubmissionPayload, SubmissionValue } from "@/forms/types";

export interface FormRendererProps {
  schema: FormSchema;
  formId: string;
  onSubmit: (payload: SubmissionPayload, fileBlobIds: string[]) => Promise<void>;
}

type SubmitState = "idle" | "signing" | "submitting" | "done" | "error";

export function FormRenderer({ schema, formId, onSubmit }: FormRendererProps) {
  const [values, setValues] = useState<Record<string, SubmissionValue>>({});
  const [state, setState] = useState<SubmitState>("idle");
  const [error, setError] = useState<string | null>(null);

  function setValue(id: string, value: SubmissionValue) {
    setValues((v) => ({ ...v, [id]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    for (const f of schema.fields) {
      if (f.required && !values[f.id]) {
        setError(`Required: ${f.label}`);
        return;
      }
    }

    setState("signing");
    try {
      const fileBlobIds: string[] = [];
      for (const v of Object.values(values)) {
        if (v.type === "file") fileBlobIds.push(v.blobId);
      }

      setState("submitting");
      await onSubmit(
        { version: 1, formId, submittedAt: Date.now(), values },
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
    submitting: "Storing on Walrus…",
    done: "Submitted",
    error: "Try again",
  }[state];

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
          ) : state === "done" ? (
            <Check className="h-4 w-4" />
          ) : undefined
        }
        variant={state === "done" ? "secondary" : "primary"}
      >
        {submitLabel}
      </Button>
    </form>
  );
}

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
  const [mode, setMode] = useState<"write" | "preview">("write");
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        {labelEl}
        <div className="flex items-center gap-1 p-0.5 rounded-md bg-background-soft border border-border text-[11px]">
          <button
            type="button"
            onClick={() => setMode("write")}
            className={cn(
              "px-2 py-0.5 rounded inline-flex items-center gap-1 transition-colors",
              mode === "write" ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Pencil className="h-3 w-3" /> Write
          </button>
          <button
            type="button"
            onClick={() => setMode("preview")}
            className={cn(
              "px-2 py-0.5 rounded inline-flex items-center gap-1 transition-colors",
              mode === "preview" ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Eye className="h-3 w-3" /> Preview
          </button>
        </div>
      </div>
      {mode === "write" ? (
        <Textarea
          rows={6}
          placeholder={field.helpText ?? "Markdown supported"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <MarkdownView
          src={value}
          className="min-h-[140px] rounded-lg border border-border bg-background-soft px-3 py-2 text-sm"
        />
      )}
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
                const buf = new Uint8Array(await file.arrayBuffer());
                const { blobId } = await storeBlob(buf);
                onChange({ type: "file", blobId, mimeType: file.type, encrypted: false });
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
