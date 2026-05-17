import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_SUBMISSIONS_TABLE, SUPABASE_URL } from "../config";
import { getCurrentOwnerKey } from "@/lib/ownerKey";
import type { SubmissionPayload } from "./types";

const LOCAL_SUBMISSIONS_KEY = "walrus.forms.submissions.v1";
export const SUBMISSIONS_CHANGED_EVENT = "walrus.forms.submissions.changed";

export interface StoredSubmissionRecord {
  id: string;
  formId: string;
  submitter: string;
  status: number;
  submittedAtMs: number;
  updatedAtMs: number;
  walrusBlobId: string;
  suiSubmissionObjectId?: string;
  reputationObjectId?: string;
  txDigest?: string;
  encrypted: boolean;
  decrypted: boolean;
  payload?: SubmissionPayload;
  fileBlobIds: string[];
  /** Severity recorded at resolve time (0 Low, 1 Medium, 2 High, 3 Critical). */
  resolvedSeverity?: number;
}

interface SupabaseSubmissionRow {
  id: string;
  form_id: string;
  owner_key: string | null;
  submitter: string | null;
  status: number | null;
  submitted_at_ms: number | null;
  updated_at_ms: number | null;
  walrus_blob_id: string;
  sui_submission_object_id: string | null;
  reputation_object_id: string | null;
  tx_digest: string | null;
  encrypted: boolean | null;
  decrypted: boolean | null;
  payload: unknown;
  file_blob_ids: unknown;
  resolved_severity: number | null;
}

export async function readSubmissions(formId: string): Promise<StoredSubmissionRecord[]> {
  const local = readSubmissionsSync(formId);
  const remote = await readRemoteSubmissions(formId);
  if (remote) {
    const merged = mergeSubmissions(local, remote);
    writeLocalSubmissions(mergeSubmissions(readAllLocalSubmissions(), merged));
    return merged;
  }
  return local;
}

export function readSubmissionsSync(formId: string): StoredSubmissionRecord[] {
  return readAllLocalSubmissions().filter((submission) => submission.formId === formId);
}

export async function saveSubmission(record: StoredSubmissionRecord, formOwnerKey?: string): Promise<void> {
  writeLocalSubmissions(mergeSubmissions(readAllLocalSubmissions(), [record]));
  notifySubmissionsChanged();
  await writeRemoteSubmission(record, formOwnerKey);
}

export async function updateSubmissionStatus(id: string, status: number): Promise<void> {
  const updatedAtMs = Date.now();
  writeLocalSubmissions(
    readAllLocalSubmissions().map((submission) =>
      submission.id === id ? { ...submission, status, updatedAtMs } : submission,
    ),
  );
  notifySubmissionsChanged();
  await patchRemoteSubmissionStatus(id, status, updatedAtMs);
}

function readAllLocalSubmissions(): StoredSubmissionRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LOCAL_SUBMISSIONS_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return sortSubmissions(parsed.filter(isStoredSubmissionRecord));
  } catch {
    return [];
  }
}

function mergeSubmissions(local: StoredSubmissionRecord[], remote: StoredSubmissionRecord[]): StoredSubmissionRecord[] {
  const byId = new Map<string, StoredSubmissionRecord>();
  for (const submission of [...remote, ...local]) {
    const existing = byId.get(submission.id);
    if (!existing || submission.updatedAtMs >= existing.updatedAtMs) byId.set(submission.id, submission);
  }
  return sortSubmissions([...byId.values()]);
}

function sortSubmissions(submissions: StoredSubmissionRecord[]): StoredSubmissionRecord[] {
  return submissions.sort((a, b) => b.submittedAtMs - a.submittedAtMs);
}

function writeLocalSubmissions(submissions: StoredSubmissionRecord[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_SUBMISSIONS_KEY, JSON.stringify(submissions.slice(0, 500)));
}

function notifySubmissionsChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SUBMISSIONS_CHANGED_EVENT));
}

function isStoredSubmissionRecord(value: unknown): value is StoredSubmissionRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.formId === "string" &&
    typeof record.submitter === "string" &&
    typeof record.status === "number" &&
    typeof record.submittedAtMs === "number" &&
    typeof record.updatedAtMs === "number" &&
    typeof record.walrusBlobId === "string" &&
    typeof record.encrypted === "boolean" &&
    typeof record.decrypted === "boolean" &&
    Array.isArray(record.fileBlobIds)
  );
}

function supabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY && SUPABASE_SUBMISSIONS_TABLE);
}

function supabaseEndpoint(path = ""): string {
  return `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${SUPABASE_SUBMISSIONS_TABLE}${path}`;
}

function supabaseHeaders(extra?: HeadersInit): HeadersInit {
  return {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
    "Content-Type": "application/json",
    "x-owner-key": getCurrentOwnerKey(),
    ...extra,
  };
}

async function readRemoteSubmissions(formId: string): Promise<StoredSubmissionRecord[] | null> {
  if (!supabaseConfigured()) return null;
  try {
    const response = await fetch(
      supabaseEndpoint(`?form_id=eq.${encodeURIComponent(formId)}&select=*&order=submitted_at_ms.desc`),
      { headers: supabaseHeaders() },
    );
    if (!response.ok) return null;
    const rows = (await response.json()) as SupabaseSubmissionRow[];
    return rows.map(fromSupabaseRow).filter(isStoredSubmissionRecord);
  } catch {
    return null;
  }
}

async function writeRemoteSubmission(record: StoredSubmissionRecord, formOwnerKey?: string): Promise<void> {
  if (!supabaseConfigured()) return;
  try {
    const response = await fetch(supabaseEndpoint("?on_conflict=id"), {
      method: "POST",
      headers: supabaseHeaders({ Prefer: "resolution=merge-duplicates" }),
      body: JSON.stringify([toSupabaseRow(record, formOwnerKey)]),
    });
    if (!response.ok) console.warn("Supabase submission save failed", await response.text());
  } catch {
    // Local storage remains the immediate demo fallback.
  }
}

async function patchRemoteSubmissionStatus(id: string, status: number, updatedAtMs: number): Promise<void> {
  if (!supabaseConfigured()) return;
  try {
    const response = await fetch(supabaseEndpoint(`?id=eq.${encodeURIComponent(id)}`), {
      method: "PATCH",
      headers: supabaseHeaders(),
      body: JSON.stringify({ status, updated_at_ms: updatedAtMs }),
    });
    if (!response.ok) console.warn("Supabase submission status update failed", await response.text());
  } catch {
    // Local storage remains the immediate demo fallback.
  }
}

function toSupabaseRow(record: StoredSubmissionRecord, formOwnerKey?: string): SupabaseSubmissionRow {
  // Persist plaintext payload ONLY for public-policy submissions. Seal-encrypted
  // submissions decrypt client-side and the plaintext stays in localStorage — never
  // remote — to avoid leaking through Supabase row access.
  const payloadToPersist = !record.encrypted && record.payload ? record.payload : null;
  return {
    id: record.id,
    form_id: record.formId,
    owner_key: formOwnerKey ?? null,
    submitter: record.submitter,
    status: record.status,
    submitted_at_ms: record.submittedAtMs,
    updated_at_ms: record.updatedAtMs,
    walrus_blob_id: record.walrusBlobId,
    sui_submission_object_id: record.suiSubmissionObjectId ?? null,
    reputation_object_id: record.reputationObjectId ?? null,
    tx_digest: record.txDigest ?? null,
    encrypted: record.encrypted,
    decrypted: record.decrypted,
    payload: payloadToPersist,
    file_blob_ids: record.fileBlobIds,
    resolved_severity: record.resolvedSeverity ?? null,
  };
}

function fromSupabaseRow(row: SupabaseSubmissionRow): StoredSubmissionRecord {
  return {
    id: row.id,
    formId: row.form_id,
    submitter: row.submitter ?? "",
    status: row.status ?? 0,
    submittedAtMs: row.submitted_at_ms ?? Date.now(),
    updatedAtMs: row.updated_at_ms ?? row.submitted_at_ms ?? Date.now(),
    walrusBlobId: row.walrus_blob_id,
    suiSubmissionObjectId: row.sui_submission_object_id ?? undefined,
    reputationObjectId: row.reputation_object_id ?? undefined,
    txDigest: row.tx_digest ?? undefined,
    encrypted: Boolean(row.encrypted),
    decrypted: Boolean(row.decrypted),
    payload: row.payload ? (row.payload as SubmissionPayload) : undefined,
    fileBlobIds: stringArray(row.file_blob_ids),
    resolvedSeverity: row.resolved_severity ?? undefined,
  };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
