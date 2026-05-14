import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "../config";
import { getCurrentOwnerKey } from "@/lib/ownerKey";

const LOCAL_ALLOWLISTS_KEY = "walrus.forms.allowlists.v1";
const SUPABASE_ALLOWLISTS_TABLE = "allowlists";

export interface SavedAllowlist {
  id: string;
  name: string;
  members: string[];
}

interface SupabaseAllowlistRow {
  id: string;
  owner_key: string;
  name: string;
  members: string[];
  created_at_ms: number | null;
  updated_at_ms: number | null;
}

export async function readAllowlists(): Promise<SavedAllowlist[]> {
  const local = readAllowlistsSync();
  const remote = await readRemoteAllowlists();
  if (remote) {
    const merged = mergeAllowlists(local, remote);
    writeLocalAllowlists(merged);
    return merged;
  }
  return local;
}

export function readAllowlistsSync(): SavedAllowlist[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LOCAL_ALLOWLISTS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isAllowlist) : [];
  } catch {
    return [];
  }
}

export async function writeAllowlists(lists: SavedAllowlist[]): Promise<void> {
  if (typeof window === "undefined") return;
  writeLocalAllowlists(lists);
  void writeRemoteAllowlists(lists);
}

function writeLocalAllowlists(lists: SavedAllowlist[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_ALLOWLISTS_KEY, JSON.stringify(lists));
}

function isAllowlist(value: unknown): value is SavedAllowlist {
  if (!value || typeof value !== "object") return false;
  const list = value as Record<string, unknown>;
  return (
    typeof list.id === "string" &&
    typeof list.name === "string" &&
    Array.isArray(list.members) &&
    list.members.every((member) => typeof member === "string")
  );
}

function mergeAllowlists(local: SavedAllowlist[], remote: SavedAllowlist[]): SavedAllowlist[] {
  const byId = new Map<string, SavedAllowlist>();
  for (const list of [...remote, ...local]) byId.set(list.id, list);
  return [...byId.values()];
}

function supabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
}

function supabaseEndpoint(path = ""): string {
  return `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${SUPABASE_ALLOWLISTS_TABLE}${path}`;
}

function supabaseHeaders(extra?: HeadersInit): HeadersInit {
  return {
    "x-owner-key": getOwnerKey(),
    apikey: SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function readRemoteAllowlists(): Promise<SavedAllowlist[] | null> {
  if (!supabaseConfigured()) return null;
  try {
    const response = await fetch(
      supabaseEndpoint(`?owner_key=eq.${encodeURIComponent(getOwnerKey())}&select=*&order=updated_at_ms.desc.nullslast,created_at_ms.desc`),
      { headers: supabaseHeaders() },
    );
    if (!response.ok) return null;
    const rows = (await response.json()) as SupabaseAllowlistRow[];
    return rows.map(fromSupabaseRow).filter(isAllowlist);
  } catch {
    return null;
  }
}

async function writeRemoteAllowlists(lists: SavedAllowlist[]): Promise<void> {
  if (!supabaseConfigured()) return;
  if (lists.length === 0) return;
  try {
    // Upsert keyed on `id`. No DELETE — avoids the "blip between delete and insert wipes
    // all remote allowlists" failure mode.
    const response = await fetch(supabaseEndpoint("?on_conflict=id"), {
      method: "POST",
      headers: supabaseHeaders({ Prefer: "resolution=merge-duplicates" }),
      body: JSON.stringify(lists.map(toSupabaseRow)),
    });
    if (!response.ok) console.warn("Supabase allowlist save failed", await response.text());
  } catch {
    // Local storage remains the offline/cache fallback.
  }
}

/**
 * Remove a single allowlist remotely. Use when the user explicitly deletes one,
 * instead of the previous wipe-all-then-reinsert pattern.
 */
async function deleteRemoteAllowlist(id: string): Promise<void> {
  if (!supabaseConfigured()) return;
  try {
    const response = await fetch(
      supabaseEndpoint(
        `?id=eq.${encodeURIComponent(id)}&owner_key=eq.${encodeURIComponent(getOwnerKey())}`,
      ),
      { method: "DELETE", headers: supabaseHeaders() },
    );
    if (!response.ok) console.warn("Supabase allowlist delete failed", await response.text());
  } catch {
    // Local storage remains the offline/cache fallback.
  }
}

export async function deleteSavedAllowlist(id: string): Promise<void> {
  const next = readAllowlistsSync().filter((list) => list.id !== id);
  writeLocalAllowlists(next);
  await deleteRemoteAllowlist(id);
}

function toSupabaseRow(list: SavedAllowlist): SupabaseAllowlistRow {
  const now = Date.now();
  return {
    id: list.id,
    owner_key: getOwnerKey(),
    name: list.name,
    members: list.members,
    created_at_ms: now,
    updated_at_ms: now,
  };
}

function fromSupabaseRow(row: SupabaseAllowlistRow): SavedAllowlist {
  return {
    id: row.id,
    name: row.name,
    members: Array.isArray(row.members) ? row.members : [],
  };
}

function getOwnerKey(): string {
  return getCurrentOwnerKey();
}
