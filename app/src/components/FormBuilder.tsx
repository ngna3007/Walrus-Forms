import { useEffect, useState } from "react";
import { GripVertical, Plus, Trash2, Type, AlignLeft, Link as LinkIcon, ChevronDown, CheckSquare, Star, Image as ImageIcon, Video } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { FieldType, FormField, FormSchema } from "@/forms/types";

const FIELD_TYPES: { value: FieldType; label: string; icon: React.ReactNode }[] = [
  { value: "shortText", label: "Short text", icon: <Type className="h-3.5 w-3.5" /> },
  { value: "longText", label: "Long text", icon: <AlignLeft className="h-3.5 w-3.5" /> },
  { value: "richText", label: "Rich text", icon: <AlignLeft className="h-3.5 w-3.5" /> },
  { value: "url", label: "URL", icon: <LinkIcon className="h-3.5 w-3.5" /> },
  { value: "dropdown", label: "Dropdown", icon: <ChevronDown className="h-3.5 w-3.5" /> },
  { value: "checkbox", label: "Checkboxes", icon: <CheckSquare className="h-3.5 w-3.5" /> },
  { value: "stars", label: "Stars", icon: <Star className="h-3.5 w-3.5" /> },
  { value: "screenshot", label: "Screenshot", icon: <ImageIcon className="h-3.5 w-3.5" /> },
  { value: "video", label: "Video", icon: <Video className="h-3.5 w-3.5" /> },
];

export interface FormBuilderProps {
  initial?: FormSchema;
  onSchemaChange: (schema: FormSchema) => void;
}

export function FormBuilder({ initial, onSchemaChange }: FormBuilderProps) {
  const [schema, setSchema] = useState<FormSchema>(
    initial ?? { version: 1, title: "Untitled form", description: "", fields: [] },
  );

  useEffect(() => {
    if (initial) setSchema(initial);
  }, [initial]);

  function update(next: FormSchema) {
    setSchema(next);
    onSchemaChange(next);
  }

  function addField() {
    const id = crypto.randomUUID();
    const field: FormField = { id, type: "shortText", label: "New field", required: false };
    update({ ...schema, fields: [...schema.fields, field] });
  }

  function patchField(id: string, patch: Partial<FormField>) {
    update({
      ...schema,
      fields: schema.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    });
  }

  function removeField(id: string) {
    update({ ...schema, fields: schema.fields.filter((f) => f.id !== id) });
  }

  return (
    <Card className="p-6">
      <Label>Fields</Label>
      <div className="mt-3 flex flex-col gap-3">
        {schema.fields.map((field) => (
          <FieldEditor
            key={field.id}
            field={field}
            onChange={(patch) => patchField(field.id, patch)}
            onRemove={() => removeField(field.id)}
          />
        ))}

        <button
          type="button"
          onClick={addField}
          className={cn(
            "flex items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-background-soft py-3 text-sm text-muted-foreground transition-all",
            "hover:border-primary/50 hover:text-primary hover:bg-primary/5",
          )}
        >
          <Plus className="h-4 w-4" />
          Add field
        </button>
      </div>
    </Card>
  );
}

function FieldEditor({
  field,
  onChange,
  onRemove,
}: {
  field: FormField;
  onChange: (patch: Partial<FormField>) => void;
  onRemove: () => void;
}) {
  const supportsOptions = field.type === "dropdown" || field.type === "checkbox";
  const meta = FIELD_TYPES.find((t) => t.value === field.type);

  return (
    <div className="rounded-xl border border-border/60 bg-background-soft p-3 group hover:border-border">
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground/40 cursor-grab">
          <GripVertical className="h-4 w-4" />
        </span>

        <Input
          className="flex-1 bg-background"
          value={field.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="Field label"
        />

        <div className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-background border border-border/60 text-xs text-muted-foreground">
          {meta?.icon}
          <Select
            className="bg-transparent border-0 h-auto py-0 pr-6 text-xs focus:ring-0"
            value={field.type}
            onChange={(e) => onChange({ type: e.target.value as FieldType })}
          >
            {FIELD_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </div>

        <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground select-none">
          <input
            type="checkbox"
            checked={field.required}
            onChange={(e) => onChange({ required: e.target.checked })}
            className="accent-primary"
          />
          Required
        </label>

        <button
          type="button"
          onClick={onRemove}
          className="text-muted-foreground/60 hover:text-destructive p-1.5 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {supportsOptions && (
        <div className="mt-3 ml-7">
          <Input
            className="text-xs bg-background"
            value={(field.options ?? []).join(", ")}
            onChange={(e) =>
              onChange({
                options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
              })
            }
            placeholder="Comma-separated options"
          />
        </div>
      )}
    </div>
  );
}
