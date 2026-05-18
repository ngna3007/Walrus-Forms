import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  GripVertical,
  Trash2,
  Type,
  AlignLeft,
  Link as LinkIcon,
  ChevronDown,
  CheckSquare,
  Star,
  Image as ImageIcon,
  Video,
  FileText,
  Plus,
} from "lucide-react";

import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { FieldType, FormField, FormSchema } from "@/forms/types";

// ─── Field type definitions ────────────────────────────────────────────────

interface FieldTypeDef {
  value: FieldType;
  label: string;
  description: string;
  icon: React.ReactNode;
  gradient: string;
}

const FIELD_TYPES: FieldTypeDef[] = [
  {
    value: "shortText",
    label: "Short Text",
    description: "Single-line input",
    icon: <Type className="h-4 w-4" />,
    gradient: "from-violet-500 to-purple-600",
  },
  {
    value: "longText",
    label: "Long Text",
    description: "Multi-line textarea",
    icon: <AlignLeft className="h-4 w-4" />,
    gradient: "from-blue-500 to-cyan-600",
  },
  {
    value: "richText",
    label: "Rich Text",
    description: "Formatted text editor",
    icon: <FileText className="h-4 w-4" />,
    gradient: "from-teal-500 to-emerald-600",
  },
  {
    value: "url",
    label: "URL",
    description: "Web address",
    icon: <LinkIcon className="h-4 w-4" />,
    gradient: "from-sky-500 to-blue-600",
  },
  {
    value: "dropdown",
    label: "Dropdown",
    description: "Single choice select",
    icon: <ChevronDown className="h-4 w-4" />,
    gradient: "from-orange-500 to-amber-600",
  },
  {
    value: "checkbox",
    label: "Checkboxes",
    description: "Multiple choice",
    icon: <CheckSquare className="h-4 w-4" />,
    gradient: "from-green-500 to-teal-600",
  },
  {
    value: "stars",
    label: "Star Rating",
    description: "1–5 star scale",
    icon: <Star className="h-4 w-4" />,
    gradient: "from-yellow-500 to-orange-500",
  },
  {
    value: "screenshot",
    label: "Screenshot",
    description: "Image file upload",
    icon: <ImageIcon className="h-4 w-4" />,
    gradient: "from-pink-500 to-rose-600",
  },
  {
    value: "video",
    label: "Video",
    description: "Video file upload",
    icon: <Video className="h-4 w-4" />,
    gradient: "from-red-500 to-pink-600",
  },
];

const TYPE_MAP = new Map(FIELD_TYPES.map((t) => [t.value, t]));

// ─── Props ─────────────────────────────────────────────────────────────────

export interface FormBuilderProps {
  initial?: FormSchema;
  onSchemaChange: (schema: FormSchema) => void;
}

// ─── Main component ────────────────────────────────────────────────────────

export function FormBuilder({ initial, onSchemaChange }: FormBuilderProps) {
  const [schema, setSchema] = useState<FormSchema>(
    initial ?? { version: 1, title: "Untitled form", description: "", fields: [] },
  );

  // Drag state
  const [paletteHover, setPaletteHover] = useState<FieldType | null>(null);
  const [canvasOver, setCanvasOver] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null); // canvas reorder
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [isDraggingAny, setIsDraggingAny] = useState(false);
  const dragTypeRef = useRef<FieldType | null>(null); // palette → canvas
  const dragSourceRef = useRef<"palette" | "canvas" | null>(null);

  useEffect(() => {
    if (initial) setSchema(initial);
  }, [initial]);

  function update(next: FormSchema) {
    setSchema(next);
    onSchemaChange(next);
  }

  function addField(type: FieldType, atIndex?: number) {
    const id = crypto.randomUUID();
    const def = TYPE_MAP.get(type)!;
    const field: FormField = {
      id,
      type,
      label: def.label,
      required: false,
      ...(type === "stars" ? { max: 5 } : {}),
      ...(type === "dropdown" || type === "checkbox" ? { options: ["Option 1", "Option 2"] } : {}),
    };
    const fields = [...schema.fields];
    if (atIndex !== undefined) {
      fields.splice(atIndex, 0, field);
    } else {
      fields.push(field);
    }
    update({ ...schema, fields });
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

  function resetDragState() {
    setIsDraggingAny(false);
    setDragId(null);
    setCanvasOver(false);
    setDragOverIdx(null);
    dragTypeRef.current = null;
    dragSourceRef.current = null;
  }

  function reorderField(fromId: string, toIndex: number) {
    const fields = [...schema.fields];
    const fromIndex = fields.findIndex((f) => f.id === fromId);
    if (fromIndex === -1) return;
    const [item] = fields.splice(fromIndex, 1);
    const insertAt = toIndex > fromIndex ? toIndex - 1 : toIndex;
    fields.splice(insertAt, 0, item);
    update({ ...schema, fields });
  }

  // ── Palette drag handlers ──

  function handlePaletteDragStart(e: React.DragEvent, type: FieldType) {
    dragTypeRef.current = type;
    dragSourceRef.current = "palette";
    setIsDraggingAny(true);
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData("text/plain", type);
  }

  // ── Canvas drag handlers ──

  function handleCanvasDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = dragSourceRef.current === "canvas" ? "move" : "copy";
    setCanvasOver(true);
    setDragOverIdx(idx);
  }

  function handleCanvasDragOverEnd() {
    setCanvasOver(false);
    setDragOverIdx(null);
  }

  function handleCanvasDrop(e: React.DragEvent, atIndex: number) {
    e.preventDefault();
    const src = dragSourceRef.current;
    const type = dragTypeRef.current;
    const id = dragId;
    resetDragState();
    if (src === "palette" && type) {
      addField(type, atIndex);
    } else if (src === "canvas" && id) {
      reorderField(id, atIndex);
    }
  }

  function handleCanvasBottomDrop(e: React.DragEvent) {
    e.preventDefault();
    const src = dragSourceRef.current;
    const type = dragTypeRef.current;
    const id = dragId;
    resetDragState();
    if (src === "palette" && type) {
      addField(type);
    } else if (src === "canvas" && id) {
      reorderField(id, schema.fields.length);
    }
  }

  function handleFieldDragStart(e: React.DragEvent, id: string) {
    dragSourceRef.current = "canvas";
    dragTypeRef.current = null;
    setIsDraggingAny(true);
    setDragId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
    const ghost = document.createElement("div");
    ghost.textContent = "Moving field";
    Object.assign(ghost.style, {
      position: "fixed", top: "-200px",
      padding: "4px 12px", borderRadius: "6px",
      background: "var(--primary)", color: "#fff",
      fontSize: "12px", fontWeight: "600", whiteSpace: "nowrap",
      pointerEvents: "none",
    });
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, 16);
    requestAnimationFrame(() => document.body.removeChild(ghost));
  }

  const isEmpty = schema.fields.length === 0;

  return (
    <div className="flex gap-0 rounded-2xl border border-border/60 overflow-hidden bg-background shadow-sm" style={{ height: "min(85vh, 800px)" }}>
      {/* ── Left: Palette ── */}
      <aside className="w-64 shrink-0 border-r border-border/60 bg-gradient-to-b from-background-soft to-background flex flex-col overflow-hidden">
        <div className="px-4 pt-5 pb-3">
          <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground/70 mb-1">
            Field Types
          </p>
          <p className="text-xs text-muted-foreground/50">Drag to add fields</p>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-4 flex flex-col gap-1.5">
          {FIELD_TYPES.map((def) => (
            <PaletteTile
              key={def.value}
              def={def}
              hovered={paletteHover === def.value}
              onMouseEnter={() => setPaletteHover(def.value)}
              onMouseLeave={() => setPaletteHover(null)}
              onDragStart={(e) => handlePaletteDragStart(e, def.value)}
              onDragEnd={resetDragState}
              onDoubleClick={() => addField(def.value)}
            />
          ))}
        </div>

      </aside>

      {/* ── Right: Canvas ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {isEmpty ? (
          <EmptyCanvas
            onDragOver={(e) => {
              e.preventDefault();
              setCanvasOver(true);
            }}
            onDragLeave={() => setCanvasOver(false)}
            onDrop={handleCanvasBottomDrop}
            over={canvasOver}
          />
        ) : (
          <div
            className="flex-1 overflow-y-auto p-5 flex flex-col gap-0"
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                handleCanvasDragOverEnd();
              }
            }}
            onDragEnd={resetDragState}
          >
            <AnimatePresence initial={false}>
              {schema.fields.map((field, idx) => (
                <motion.div
                  key={field.id}
                  layout
                  initial={{ opacity: 0, scale: 0.97, y: -6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -4 }}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                >
                  {/* Drop zone before this card */}
                  <DropIndicator
                    active={dragOverIdx === idx && canvasOver}
                    isDraggingAny={isDraggingAny}
                    onDragOver={(e) => handleCanvasDragOver(e, idx)}
                    onDrop={(e) => handleCanvasDrop(e, idx)}
                  />

                  <FieldCard
                    field={field}
                    onChange={(patch) => patchField(field.id, patch)}
                    onRemove={() => removeField(field.id)}
                    onDragStart={(e) => handleFieldDragStart(e, field.id)}
                    onDragEnd={resetDragState}
                    isDragging={dragId === field.id}
                  />
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Drop zone at bottom */}
            <motion.div layout>
              <DropIndicator
                active={dragOverIdx === schema.fields.length && canvasOver}
                isDraggingAny={isDraggingAny}
                onDragOver={(e) => handleCanvasDragOver(e, schema.fields.length)}
                onDrop={(e) => handleCanvasDrop(e, schema.fields.length)}
              />
            </motion.div>

            {/* Bottom add strip */}
            <div
              className={cn(
                "mt-4 rounded-xl border border-dashed py-3 flex items-center justify-center gap-2 text-xs text-muted-foreground/60 transition-colors cursor-pointer",
                canvasOver && dragSourceRef.current === "palette"
                  ? "border-primary/50 text-primary bg-primary/5"
                  : "border-border/40 hover:border-border hover:text-muted-foreground",
              )}
              onDragOver={(e) => {
                e.preventDefault();
                setCanvasOver(true);
                setDragOverIdx(schema.fields.length);
              }}
              onDrop={handleCanvasBottomDrop}
              onClick={() => addField("shortText")}
            >
              <Plus className="h-3.5 w-3.5" />
              Drag field here or click to add
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Palette tile ──────────────────────────────────────────────────────────

function PaletteTile({
  def,
  hovered,
  onMouseEnter,
  onMouseLeave,
  onDragStart,
  onDragEnd,
  onDoubleClick,
}: {
  def: FieldTypeDef;
  hovered: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDoubleClick: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDoubleClick={onDoubleClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={cn(
        "flex items-center gap-3 rounded-lg px-2.5 py-2 cursor-grab select-none transition-all",
        hovered
          ? "bg-background shadow-sm border border-border/80 scale-[1.02]"
          : "hover:bg-background/80 border border-transparent",
      )}
    >
      <div
        className={cn(
          "h-8 w-8 rounded-lg bg-gradient-to-br flex items-center justify-center text-white shrink-0 shadow-sm",
          def.gradient,
        )}
      >
        {def.icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-foreground leading-tight">{def.label}</p>
        <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{def.description}</p>
      </div>
    </div>
  );
}

// ─── Empty canvas ──────────────────────────────────────────────────────────

function EmptyCanvas({
  onDragOver,
  onDragLeave,
  onDrop,
  over,
}: {
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  over: boolean;
}) {
  return (
    <div
      className={cn(
        "flex-1 flex flex-col items-center justify-center gap-6 p-10 transition-all",
        over ? "bg-primary/5" : "bg-background",
      )}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <img
        src="/walrus-builder.png"
        alt=""
        className={cn(
          "w-40 h-auto object-contain drop-shadow-lg transition-all pointer-events-none select-none",
          over ? "scale-105 opacity-80" : "opacity-60",
        )}
      />
      <div className="text-center">
        <p className={cn("text-sm font-medium transition-colors", over ? "text-primary" : "text-muted-foreground")}>
          {over ? "Release to add field" : "Drag field types here"}
        </p>
        <p className="text-xs text-muted-foreground/50 mt-1">
          Pick from the left panel and drop to build your form
        </p>
      </div>
      <div
        className={cn(
          "rounded-xl border-2 border-dashed w-full max-w-xs h-20 flex items-center justify-center transition-all",
          over ? "border-primary/60 bg-primary/10" : "border-border/40",
        )}
      >
        <Plus className={cn("h-5 w-5 transition-colors", over ? "text-primary" : "text-muted-foreground/30")} />
      </div>
    </div>
  );
}

// ─── Drop indicator ────────────────────────────────────────────────────────

function DropIndicator({
  active,
  isDraggingAny,
  onDragOver,
  onDrop,
}: {
  active: boolean;
  isDraggingAny: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  return (
    <div
      className={cn(
        "relative mx-1 flex items-center transition-all duration-150",
        isDraggingAny ? "h-8" : "h-1",
      )}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div
        className={cn(
          "absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-full transition-all duration-150",
          active ? "h-0.5 bg-primary shadow-[0_0_6px_1px] shadow-primary/50" : "h-px bg-transparent",
        )}
      />
      {active && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full bg-primary border-2 border-background shadow-sm" />
      )}
    </div>
  );
}

// ─── Field card ────────────────────────────────────────────────────────────

function FieldCard({
  field,
  onChange,
  onRemove,
  onDragStart,
  onDragEnd,
  isDragging,
}: {
  field: FormField;
  onChange: (patch: Partial<FormField>) => void;
  onRemove: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  isDragging: boolean;
}) {
  const def = TYPE_MAP.get(field.type)!;
  const [editingLabel, setEditingLabel] = useState(false);
  const labelRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  function handleLabelClick() {
    setEditingLabel(true);
    setTimeout(() => labelRef.current?.select(), 10);
  }

  return (
    <div
      ref={cardRef}
      draggable={false}
      onDragStart={onDragStart}
      onDragEnd={() => { if (cardRef.current) cardRef.current.draggable = false; onDragEnd(); }}
      onDragOver={(e) => e.preventDefault()}
      className={cn(
        "rounded-xl border bg-background shadow-sm mb-2 overflow-hidden transition-all group",
        isDragging ? "opacity-40 scale-[0.98] border-primary/40" : "border-border/60 hover:border-border hover:shadow-md",
      )}
    >
      {/* Card header bar */}
      <div className={cn("h-1 bg-gradient-to-r", def.gradient)} />

      <div className="p-4">
        {/* Top row: drag handle, type badge, label, controls */}
        <div className="flex items-start gap-3">
          <button
            type="button"
            className="mt-0.5 cursor-grab text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors shrink-0 touch-none"
            onMouseDown={() => { if (cardRef.current) cardRef.current.draggable = true; }}
          >
            <GripVertical className="h-4 w-4" />
          </button>

          <div className="flex-1 min-w-0">
            {/* Type badge */}
            <div className="flex items-center gap-2 mb-2">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 text-white text-[10px] font-medium px-2 py-0.5 rounded-full bg-gradient-to-r",
                  def.gradient,
                )}
              >
                {def.icon}
                {def.label}
              </span>
              {field.required && (
                <span className="inline-flex items-center gap-0.5 text-[10px] text-rose-500 font-medium">
                  * Required
                </span>
              )}
            </div>

            {/* Editable label */}
            {editingLabel ? (
              <Input
                ref={labelRef}
                className="text-sm font-medium h-7 px-2 bg-background-soft"
                value={field.label}
                onChange={(e) => onChange({ label: e.target.value })}
                onBlur={() => setEditingLabel(false)}
                onKeyDown={(e) => e.key === "Enter" && setEditingLabel(false)}
                placeholder="Field label"
              />
            ) : (
              <button
                type="button"
                className="text-sm font-medium text-foreground text-left hover:text-primary transition-colors w-full truncate"
                onClick={handleLabelClick}
                title="Click to edit label"
              >
                {field.label || <span className="text-muted-foreground/40 italic">Untitled field</span>}
              </button>
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <label className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground select-none cursor-pointer">
              <input
                type="checkbox"
                checked={field.required}
                onChange={(e) => onChange({ required: e.target.checked })}
                className="accent-rose-500 h-3 w-3"
              />
              Required
            </label>
            <button
              type="button"
              onClick={onRemove}
              className="p-1 rounded text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Help text */}
        <div className="mt-2 ml-7">
          <Input
            className="text-xs bg-background-soft h-7 text-muted-foreground placeholder:text-muted-foreground/30"
            value={field.helpText ?? ""}
            onChange={(e) => onChange({ helpText: e.target.value || undefined })}
            placeholder="Help text (optional)"
          />
        </div>

        {/* Options editor for dropdown/checkbox */}
        {(field.type === "dropdown" || field.type === "checkbox") && (
          <div className="mt-2 ml-7 space-y-1">
            {(field.options ?? []).map((opt, i) => (
              <div key={i} className="flex items-center gap-1">
                <Input
                  className="text-xs bg-background-soft h-7 flex-1"
                  value={opt}
                  onChange={(e) => {
                    const next = [...(field.options ?? [])];
                    next[i] = e.target.value;
                    onChange({ options: next });
                  }}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const next = [...(field.options ?? [])];
                      next.splice(i + 1, 0, "");
                      onChange({ options: next });
                    }
                    if (e.key === "Backspace" && opt === "" && (field.options ?? []).length > 1) {
                      e.preventDefault();
                      const next = [...(field.options ?? [])];
                      next.splice(i, 1);
                      onChange({ options: next });
                    }
                  }}
                  onPaste={(e) => e.stopPropagation()}
                  onCut={(e) => e.stopPropagation()}
                  onCopy={(e) => e.stopPropagation()}
                  placeholder={`Option ${i + 1}`}
                  autoFocus={opt === "" && i > 0}
                />
                <button
                  type="button"
                  onClick={() => {
                    const next = (field.options ?? []).filter((_, j) => j !== i);
                    onChange({ options: next.length ? next : [""] });
                  }}
                  className="p-1 rounded text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => onChange({ options: [...(field.options ?? []), ""] })}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors mt-0.5"
            >
              <Plus className="h-3 w-3" />
              Add option
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Field preview ─────────────────────────────────────────────────────────

function FieldPreview({ field, onChange }: { field: FormField; onChange: (p: Partial<FormField>) => void }) {
  switch (field.type) {
    case "shortText":
      return (
        <input
          disabled
          placeholder="Short answer text"
          className="w-full rounded-lg border border-border/60 bg-background-soft px-3 py-2 text-xs text-muted-foreground placeholder:text-muted-foreground/40 outline-none"
        />
      );

    case "longText":
      return (
        <textarea
          disabled
          placeholder="Long answer text…"
          rows={3}
          className="w-full rounded-lg border border-border/60 bg-background-soft px-3 py-2 text-xs text-muted-foreground placeholder:text-muted-foreground/40 outline-none resize-none"
        />
      );

    case "richText":
      return (
        <div className="rounded-lg border border-border/60 bg-background-soft overflow-hidden">
          <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border/40 bg-background">
            {["B", "I", "U"].map((t) => (
              <span key={t} className="text-[10px] font-bold text-muted-foreground/40 px-1.5 py-0.5 rounded bg-background-soft border border-border/40">
                {t}
              </span>
            ))}
            <div className="w-px h-3 bg-border/60 mx-1" />
            <span className="text-[10px] text-muted-foreground/40 px-1.5 py-0.5 rounded bg-background-soft border border-border/40">≡</span>
          </div>
          <div className="px-3 py-2 text-xs text-muted-foreground/40">Start typing…</div>
        </div>
      );

    case "url":
      return (
        <div className="flex items-center rounded-lg border border-border/60 bg-background-soft overflow-hidden">
          <span className="px-2.5 text-[10px] text-muted-foreground/50 border-r border-border/40 py-2 bg-background shrink-0">https://</span>
          <input disabled placeholder="example.com" className="flex-1 px-2.5 py-2 text-xs text-muted-foreground/40 bg-transparent outline-none" />
        </div>
      );

    case "dropdown": {
      const options = field.options ?? ["Option 1", "Option 2"];
      return (
        <div className="relative">
          <select
            disabled
            className="w-full rounded-lg border border-border/60 bg-background-soft px-3 py-2 text-xs text-muted-foreground/40 appearance-none outline-none pr-8"
          >
            <option value="">Select an option…</option>
            {options.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/40 pointer-events-none" />
        </div>
      );
    }

    case "checkbox": {
      const options = field.options ?? ["Option 1", "Option 2"];
      return (
        <div className="flex flex-col gap-1.5">
          {options.slice(0, 4).map((o) => (
            <label key={o} className="flex items-center gap-2 text-xs text-muted-foreground/60 cursor-default">
              <span className="h-3.5 w-3.5 rounded border border-border/60 bg-background-soft inline-block shrink-0" />
              {o}
            </label>
          ))}
        </div>
      );
    }

    case "stars": {
      const max = field.max ?? 5;
      return (
        <div className="flex items-center gap-1">
          {Array.from({ length: max }).map((_, i) => (
            <Star
              key={i}
              className={cn("h-5 w-5", i < 3 ? "text-yellow-400 fill-yellow-400" : "text-border")}
            />
          ))}
          <span className="ml-2 text-[10px] text-muted-foreground/40">
            {max} stars max
          </span>
          <select
            className="ml-auto text-[10px] text-muted-foreground/60 border border-border/40 rounded px-1 py-0.5 bg-background-soft pointer-events-auto"
            value={max}
            onChange={(e) => onChange({ max: Number(e.target.value) })}
            title="Max stars"
          >
            {[3, 4, 5, 7, 10].map((n) => (
              <option key={n} value={n}>{n} stars</option>
            ))}
          </select>
        </div>
      );
    }

    case "screenshot":
      return (
        <div className="rounded-lg border-2 border-dashed border-border/50 bg-background-soft/50 p-4 flex flex-col items-center gap-2">
          <ImageIcon className="h-6 w-6 text-muted-foreground/30" />
          <p className="text-[10px] text-muted-foreground/50">Drop image or click to upload</p>
        </div>
      );

    case "video":
      return (
        <div className="rounded-lg border-2 border-dashed border-border/50 bg-background-soft/50 p-4 flex flex-col items-center gap-2">
          <Video className="h-6 w-6 text-muted-foreground/30" />
          <p className="text-[10px] text-muted-foreground/50">Drop video or click to upload</p>
        </div>
      );

    default:
      return null;
  }
}
