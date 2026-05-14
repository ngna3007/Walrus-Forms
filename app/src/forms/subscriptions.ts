import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "../config";
import { getCurrentOwnerKey } from "@/lib/ownerKey";

const STORAGE_PREFIX = "walrus.forms.subscriptions.v1:";
const SUPABASE_TABLE = "form_subscriptions";
export const SUBSCRIPTIONS_CHANGED_EVENT = "walrus.forms.subscriptions.changed";

export interface FormSubscription {
  id: string;
  title: string;
  ownerAddress?: string;
  policyKind?: "public" | "allowlist" | "timelock" | "tokenGated";
  addedAtMs: number;
}

interface SupabaseSubRow {
  owner_key: string;
  form_id: string;
  title: string | null;
  form_owner_address: string | null;
  policy_kind: string | null;
  added_at_ms: number;
}

function localKey(owner: string): string {
  return `${STORAGE_PREFIX}${owner.toLowerCase()}`;
}

function readLocal(owner: string): FormSubscription[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(localKey(owner));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as FormSubscription[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(owner: string, list: FormSubscription[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(localKey(owner), JSON.stringify(list));
  window.dispatchEvent(new Event(SUBSCRIPTIONS_CHANGED_EVENT));
}

function supabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
}

function endpoint(path = ""): string {
  return `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${SUPABASE_TABLE}${path}`;
}

function headers(owner: string, extra?: HeadersInit): HeadersInit {
  return {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
    "Content-Type": "application/json",
    "x-owner-key": owner,
    ...extra,
  };
}

function fromRow(row: SupabaseSubRow): FormSubscription {
  return {
    id: row.form_id,
    title: row.title ?? "Untitled form",
    ownerAddress: row.form_owner_address ?? undefined,
    policyKind: (row.policy_kind as FormSubscription["policyKind"]) ?? undefined,
    addedAtMs: row.added_at_ms,
  };
}

function toRow(owner: string, entry: FormSubscription): SupabaseSubRow {
  return {
    owner_key: owner,
    form_id: entry.id,
    title: entry.title,
    form_owner_address: entry.ownerAddress ?? null,
    policy_kind: entry.policyKind ?? null,
    added_at_ms: entry.addedAtMs,
  };
}

/** Returns cached (localStorage) subscriptions immediately. */
export function readSubscriptions(ownerOverride?: string): FormSubscription[] {
  const owner = ownerOverride ?? getCurrentOwnerKey();
  if (!owner) return [];
  return readLocal(owner);
}

/** Pulls Supabase rows for the connected wallet and refreshes the local cache. */
export async function refreshSubscriptions(ownerOverride?: string): Promise<FormSubscription[]> {
  const owner = ownerOverride ?? getCurrentOwnerKey();
  if (!owner) return [];
  if (!supabaseConfigured()) return readLocal(owner);
  try {
    const response = await fetch(
      endpoint(`?owner_key=eq.${encodeURIComponent(owner)}&select=*&order=added_at_ms.desc`),
      { headers: headers(owner) },
    );
    if (!response.ok) return readLocal(owner);
    const rows = (await response.json()) as SupabaseSubRow[];
    const next = rows.map(fromRow);
    writeLocal(owner, next);
    return next;
  } catch {
    return readLocal(owner);
  }
}

export async function addSubscription(entry: FormSubscription, ownerOverride?: string): Promise<void> {
  const owner = ownerOverride ?? getCurrentOwnerKey();
  if (!owner) return;
  // Owners already see the form under "My forms".
  if (entry.ownerAddress && entry.ownerAddress.toLowerCase() === owner.toLowerCase()) return;
  const current = readLocal(owner);
  const existing = current.find((s) => s.id === entry.id);
  const merged = existing
    ? { ...existing, ...entry, addedAtMs: existing.addedAtMs }
    : entry;
  const nextList = existing
    ? current.map((s) => (s.id === entry.id ? merged : s))
    : [...current, merged];
  writeLocal(owner, nextList);
  if (!supabaseConfigured()) return;
  try {
    await fetch(endpoint(), {
      method: "POST",
      headers: headers(owner, { Prefer: "resolution=merge-duplicates" }),
      body: JSON.stringify([toRow(owner, merged)]),
    });
  } catch {
    // Cache-only fallback.
  }
}

export async function removeSubscription(formId: string, ownerOverride?: string): Promise<void> {
  const owner = ownerOverride ?? getCurrentOwnerKey();
  if (!owner) return;
  writeLocal(owner, readLocal(owner).filter((s) => s.id !== formId));
  if (!supabaseConfigured()) return;
  try {
    await fetch(
      endpoint(`?owner_key=eq.${encodeURIComponent(owner)}&form_id=eq.${encodeURIComponent(formId)}`),
      {
        method: "DELETE",
        headers: headers(owner),
      },
    );
  } catch {
    // Local removal already applied.
  }
}
