import type { FormPolicy } from "./submit";
import type { FormSchema, WebhookSettings } from "./types";
import { SUPABASE_FORMS_TABLE, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "../config";
import { getCurrentOwnerKey } from "@/lib/ownerKey";

const LOCAL_FORMS_KEY = "walrus.forms.localForms.v1";
export const LOCAL_FORMS_CHANGED_EVENT = "walrus.forms.localForms.changed";

export interface LocalFormRecord {
  id: string;
  title: string;
  createdAtMs: number;
  updatedAtMs?: number;
  status?: "draft" | "published";
  submissionCount?: number;
  schema?: FormSchema;
  policy?: FormPolicy;
  webhooks?: WebhookSettings[];
  archivedAtMs?: number;
  /** sui-groups PermissionedGroup object ID created at publish time. */
  groupObjectId?: string;
  /** Wallet address that owns this form. Used to scope localStorage per wallet. */
  ownerKey?: string;
}

interface SupabaseFormRow {
  id: string;
  owner_key: string;
  title: string;
  status: "draft" | "published" | null;
  created_at_ms: number;
  updated_at_ms: number | null;
  submission_count: number | null;
  schema: unknown;
  policy: unknown;
  webhooks: unknown;
  archived_at_ms: number | null;
  group_object_id: string | null;
}

export async function readLocalForms(): Promise<LocalFormRecord[]> {
  const local = readLocalFormsSync();
  const remote = await readRemoteForms();
  if (remote) {
    const merged = mergeForms(local, remote);
    writeLocalForms(merged);
    return merged;
  }
  return local;
}

export function readLocalFormsSync(): LocalFormRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LOCAL_FORMS_KEY) ?? "[]", reviveBigInt);
    if (!Array.isArray(parsed)) return [];
    const currentKey = getCurrentOwnerKey();
    return sortForms(
      parsed.filter(isLocalFormRecord).filter(
        // Records without ownerKey are legacy data — allow through for backward compat.
        (r) => !r.ownerKey || r.ownerKey === currentKey,
      ),
    );
  } catch {
    return [];
  }
}

export async function readLocalForm(id: string): Promise<LocalFormRecord | null> {
  const remote = await readRemoteForm(id);
  if (remote) return remote;
  return readLocalFormsSync().find((form) => form.id === id) ?? null;
}

export async function saveLocalForm(record: LocalFormRecord): Promise<void> {
  if (typeof window === "undefined") return;
  const stamped: LocalFormRecord = { ...record, ownerKey: getOwnerKey() };
  const next = [stamped, ...readLocalFormsSync().filter((form) => form.id !== record.id)];
  writeLocalForms(next.slice(0, 50));
  void writeRemoteForm(stamped);
  notifyLocalFormsChanged();
}

export async function deleteLocalForm(id: string): Promise<void> {
  if (typeof window === "undefined") return;
  writeLocalForms(readLocalFormsSync().filter((form) => form.id !== id));
  void deleteRemoteForm(id);
  notifyLocalFormsChanged();
}

/**
 * Soft-archive a form. Keeps the record (and on-chain object) but flags it so
 * the dashboard hides it from the main list and shows it under the Archived
 * tab. Persisted via the same Supabase path as other form fields.
 */
export async function setLocalFormArchived(id: string, archived: boolean): Promise<void> {
  if (typeof window === "undefined") return;
  const forms = readLocalFormsSync();
  const idx = forms.findIndex((form) => form.id === id);
  if (idx === -1) return;
  const next: LocalFormRecord = {
    ...forms[idx],
    archivedAtMs: archived ? Date.now() : undefined,
    updatedAtMs: Date.now(),
  };
  forms[idx] = next;
  writeLocalForms(forms);
  void writeRemoteForm(next);
  notifyLocalFormsChanged();
}

/**
 * Increment a form's cached submission count by 1.
 *
 * Source of truth is the on-chain `Form.submission_count` field, but
 * the dashboard reads from the localStorage / Supabase cache for snappy
 * rendering. Call this after a successful submission to keep the card
 * count in sync without round-tripping to the chain.
 */
export async function bumpFormSubmissionCount(formId: string, delta = 1): Promise<void> {
  if (typeof window === "undefined") return;
  const forms = readLocalFormsSync();
  const idx = forms.findIndex((form) => form.id === formId);
  if (idx === -1) return;
  const current = forms[idx];
  const next: LocalFormRecord = {
    ...current,
    submissionCount: Math.max(0, (current.submissionCount ?? 0) + delta),
    updatedAtMs: Date.now(),
  };
  const merged = [next, ...forms.filter((form) => form.id !== formId)];
  writeLocalForms(merged.slice(0, 50));
  void writeRemoteForm(next);
  notifyLocalFormsChanged();
}

function mergeForms(local: LocalFormRecord[], remote: LocalFormRecord[]): LocalFormRecord[] {
  const byId = new Map<string, LocalFormRecord>();
  for (const form of [...remote, ...local]) {
    const existing = byId.get(form.id);
    if (!existing || (form.updatedAtMs ?? form.createdAtMs) >= (existing.updatedAtMs ?? existing.createdAtMs)) {
      byId.set(form.id, form);
    }
  }
  return sortForms([...byId.values()]);
}

function sortForms(forms: LocalFormRecord[]): LocalFormRecord[] {
  return forms.sort((a, b) => (b.updatedAtMs ?? b.createdAtMs) - (a.updatedAtMs ?? a.createdAtMs));
}

function writeLocalForms(forms: LocalFormRecord[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_FORMS_KEY, JSON.stringify(forms, replaceBigInt));
}

function isLocalFormRecord(value: unknown): value is LocalFormRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.title === "string" &&
    typeof record.createdAtMs === "number" &&
    (record.updatedAtMs === undefined || typeof record.updatedAtMs === "number") &&
    (record.status === undefined || record.status === "draft" || record.status === "published")
  );
}

function replaceBigInt(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? `${value.toString()}n` : value;
}

function reviveBigInt(_key: string, value: unknown): unknown {
  return typeof value === "string" && /^\d+n$/.test(value) ? BigInt(value.slice(0, -1)) : value;
}

function notifyLocalFormsChanged(): void {
  window.dispatchEvent(new Event(LOCAL_FORMS_CHANGED_EVENT));
}

function supabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY && SUPABASE_FORMS_TABLE);
}

function supabaseEndpoint(path = ""): string {
  return `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${SUPABASE_FORMS_TABLE}${path}`;
}

function supabaseHeaders(extra?: HeadersInit): HeadersInit {
  return {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
    "Content-Type": "application/json",
    "x-owner-key": getOwnerKey(),
    ...extra,
  };
}

async function readRemoteForms(): Promise<LocalFormRecord[] | null> {
  if (!supabaseConfigured()) return null;
  const key = getOwnerKey();
  if (!key || key === "anonymous") return null;
  try {
    const response = await fetch(
      supabaseEndpoint(
        `?owner_key=eq.${encodeURIComponent(getOwnerKey())}&select=*&order=updated_at_ms.desc.nullslast,created_at_ms.desc`,
      ),
      { headers: supabaseHeaders() },
    );
    if (!response.ok) return null;
    const rows = (await response.json()) as SupabaseFormRow[];
    return rows.map(fromSupabaseRow).filter(isLocalFormRecord);
  } catch {
    return null;
  }
}

async function readRemoteForm(id: string): Promise<LocalFormRecord | null> {
  if (!supabaseConfigured()) return null;
  const key = getOwnerKey();
  if (!key || key === "anonymous") return null;
  try {
    const response = await fetch(
      supabaseEndpoint(`?id=eq.${encodeURIComponent(id)}&owner_key=eq.${encodeURIComponent(getOwnerKey())}&select=*&limit=1`),
      { headers: supabaseHeaders() },
    );
    if (!response.ok) return null;
    const rows = (await response.json()) as SupabaseFormRow[];
    return rows[0] ? fromSupabaseRow(rows[0]) : null;
  } catch {
    return null;
  }
}

async function writeRemoteForm(record: LocalFormRecord): Promise<void> {
  if (!supabaseConfigured()) return;
  try {
    const response = await fetch(supabaseEndpoint("?on_conflict=id"), {
      method: "POST",
      headers: supabaseHeaders({ Prefer: "resolution=merge-duplicates" }),
      body: JSON.stringify([toSupabaseRow(record)], replaceBigInt),
    });
    if (!response.ok) console.warn("Supabase form save failed", await response.text());
  } catch {
    // Local storage remains the offline/cache fallback.
  }
}

async function deleteRemoteForm(id: string): Promise<void> {
  if (!supabaseConfigured()) return;
  try {
    const response = await fetch(supabaseEndpoint(`?id=eq.${encodeURIComponent(id)}&owner_key=eq.${encodeURIComponent(getOwnerKey())}`), {
      method: "DELETE",
      headers: supabaseHeaders(),
    });
    if (!response.ok) console.warn("Supabase form delete failed", await response.text());
  } catch {
    // Local storage remains the offline/cache fallback.
  }
}

function toSupabaseRow(record: LocalFormRecord): SupabaseFormRow {
  return {
    id: record.id,
    owner_key: getOwnerKey(),
    title: record.title,
    status: record.status ?? "published",
    created_at_ms: record.createdAtMs,
    updated_at_ms: record.updatedAtMs ?? record.createdAtMs,
    submission_count: record.submissionCount ?? 0,
    schema: record.schema ?? null,
    policy: record.policy ?? null,
    webhooks: record.webhooks ?? null,
    archived_at_ms: record.archivedAtMs ?? null,
    group_object_id: record.groupObjectId ?? null,
  };
}

function fromSupabaseRow(row: SupabaseFormRow): LocalFormRecord {
  return {
    id: row.id,
    title: row.title,
    status: row.status ?? "published",
    createdAtMs: row.created_at_ms,
    updatedAtMs: row.updated_at_ms ?? undefined,
    submissionCount: row.submission_count ?? undefined,
    schema: reviveJson(row.schema) as FormSchema | undefined,
    policy: reviveJson(row.policy) as FormPolicy | undefined,
    webhooks: reviveJson(row.webhooks) as WebhookSettings[] | undefined,
    archivedAtMs: row.archived_at_ms ?? undefined,
    groupObjectId: row.group_object_id ?? undefined,
    ownerKey: row.owner_key,
  };
}

function getOwnerKey(): string {
  return getCurrentOwnerKey();
}

function reviveJson(value: unknown): unknown {
  return value == null ? undefined : JSON.parse(JSON.stringify(value), reviveBigInt);
}
