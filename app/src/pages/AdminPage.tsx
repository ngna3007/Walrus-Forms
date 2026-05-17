import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Copy,
  Download,
  Eye,
  ExternalLink,
  Filter,
  KeyRound,
  Loader2,
  Lock,
  Pencil,
  Send,
  Share2,
  Sparkles,
  Trash2,
  UserPlus,
  Vote,
} from "lucide-react";
import {
  useCurrentAccount,
  useResolveSuiNSName,
  useSignAndExecuteTransaction,
  useSignPersonalMessage,
  useSuiClient,
  useSuiClientQuery,
} from "@mysten/dapp-kit";
import { useNavigate, useParams } from "react-router-dom";
import type { SuiTransactionBlockResponse } from "@mysten/sui/jsonRpc";
import { toHex } from "@mysten/sui/utils";
import { Transaction } from "@mysten/sui/transactions";

import { AppShell, PageHeader } from "@/components/layout/AppShell";
import { ConnectGate } from "@/components/ConnectGate";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge, StatusDot } from "@/components/ui/badge";
import { Select } from "@/components/ui/input";
import { exportCsv } from "@/forms/csv";
import type { FormSchema, SubmissionPayload } from "@/forms/types";
import type { FormPolicy } from "@/forms/submit";
import { calculateReputation } from "@/forms/reputation";
import { appendBountyPayout, tierAmountForSeverity, tiersFromStrings } from "@/forms/bounty";
import { appendMintReceipt } from "@/forms/onchainReputation";
import { Transaction as TxnBuilder } from "@mysten/sui/transactions";
import { buildWebhookDeliveries } from "@/forms/webhooks";
import { buildCastRoadmapVoteTx } from "@/forms/onchainVoting";
import {
  readSubmissions,
  readSubmissionsSync,
  saveSubmission,
  SUBMISSIONS_CHANGED_EVENT,
  updateSubmissionStatus,
  type StoredSubmissionRecord,
} from "@/forms/submissions";
import { creditsForVotes, votesFromCredits } from "@/forms/voting";
import { cn, copyText, relativeTime, truncateAddr, truncateBlob } from "@/lib/utils";
import { MarkdownView } from "@/components/MarkdownView";
import { NETWORK, PACKAGE_CONFIGURED, PACKAGE_ID, WAL_COIN_TYPE } from "@/config";
import { readBlob, readJson } from "@/walrus/client";
import { decryptSubmission } from "@/seal/decrypt";
import { useSessionKey } from "@/hooks/useSessionKey";
import { WalrusBlobStatus } from "@/components/WalrusBlobStatus";
import { deleteLocalForm, readLocalForm, readLocalFormsSync, saveLocalForm, type LocalFormRecord } from "@/forms/localForms";

const STATUS = ["Open", "Triaged", "In Progress", "Resolved"] as const;
const STATUS_TONE: ("neutral" | "primary" | "tertiary" | "secondary")[] = ["neutral", "primary", "tertiary", "secondary"];

const SEVERITY_LABELS = ["Low", "Medium", "High", "Critical"] as const;

function formatMist(mist: bigint, decimals = 9): string {
  const whole = mist / 10n ** BigInt(decimals);
  const frac = mist % 10n ** BigInt(decimals);
  if (frac === 0n) return whole.toString();
  return `${whole}.${frac.toString().padStart(decimals, "0").replace(/0+$/, "")}`;
}

interface Row {
  submissionId: string;
  submitter: string;
  status: number;
  submittedAtMs: number;
  blobId: string;
  encrypted: boolean;
  decrypted: boolean;
  reputationObjectId?: string;
  txDigest?: string;
  suiSubmissionObjectId?: string;
  payload?: SubmissionPayload;
  resolvedSeverity?: number;
}

export function AdminPage() {
  const { formId } = useParams<{ formId: string }>();
  const navigate = useNavigate();
  const [schema, setSchema] = useState<FormSchema | null>(null);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [optimisticStatus, setOptimisticStatus] = useState<Record<string, number>>({});
  const [statusFilter, setStatusFilter] = useState<number | "all">("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<Record<string, number>>({});
  const [copiedFormLink, setCopiedFormLink] = useState(false);
  const [copiedTriagerLink, setCopiedTriagerLink] = useState(false);
  const [decryptingId, setDecryptingId] = useState<string | null>(null);
  const [autoDecrypting, setAutoDecrypting] = useState(false);
  const [decryptError, setDecryptError] = useState<string | null>(null);
  const attemptedAutoDecryptIds = useRef(new Set<string>());
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();
  const sessionKey = useSessionKey();
  const submitPath = `/f/${encodeURIComponent(formId ?? "preview")}`;
  const submitUrl =
    typeof window === "undefined" ? submitPath : new URL(submitPath, window.location.origin).toString();
  const realFormId = isObjectId(formId);
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction<SuiTransactionBlockResponse>({
    execute: ({ bytes, signature }) =>
      client.executeTransactionBlock({
        transactionBlock: bytes,
        signature,
        options: {
          showEffects: true,
          showEvents: true,
          showObjectChanges: true,
        },
      }),
  });
  const [grantingAccess, setGrantingAccess] = useState(false);
  const [grantAccessMessage, setGrantAccessMessage] = useState<string | null>(null);
  const [grantAccessError, setGrantAccessError] = useState<string | null>(null);
  const [formAction, setFormAction] = useState<"edit" | "delete" | null>(null);
  const [formActionError, setFormActionError] = useState<string | null>(null);
  const [localForm, setLocalForm] = useState<LocalFormRecord | null>(
    () => readLocalFormsSync().find((record) => record.id === formId) ?? null,
  );
  const resolvedLocalForm = localForm ?? readLocalFormsSync().find((record) => record.id === formId) ?? null;

  const { data: formObject, error: formQueryError } = useSuiClientQuery(
    "getObject",
    {
      id: formId ?? "",
      options: { showContent: true, showType: true },
    },
    { enabled: realFormId },
  );

  const formMeta = useMemo(() => {
    const content = formObject?.data?.content;
    if (!content || content.dataType !== "moveObject") return null;
    const fields = content.fields as Record<string, unknown>;
    const objectType = formObject?.data?.type ?? "";
    const objectPackage = objectType.split("::")[0] ?? "";
    return {
      owner: String(fields.owner ?? ""),
      title: String(fields.title ?? ""),
      schemaBlobId: String(fields.schema_blob_id ?? ""),
      policyType: Number(fields.policy_type ?? 0),
      policyObjectId: policyObjectIdFromField(fields.policy_object_id),
      unlockTimeMs: BigInt(String(fields.unlock_time_ms ?? "0")),
      open: Boolean(fields.open),
      objectPackage,
    };
  }, [formObject]);

  useEffect(() => {
    if (!formId) {
      setLocalForm(null);
      return;
    }
    let cancelled = false;
    setLocalForm(readLocalFormsSync().find((record) => record.id === formId) ?? null);
    void readLocalForm(formId).then((next) => {
      if (!cancelled) setLocalForm(next);
    });
    return () => {
      cancelled = true;
    };
  }, [formId]);

  const fallbackFormMeta = useMemo(() => {
    if (!resolvedLocalForm) return null;
    return {
      owner: "",
      title: resolvedLocalForm.title,
      schemaBlobId: "",
      policyType: policyKindToNumber(resolvedLocalForm.policy),
      policyObjectId: policyObjectIdFromPolicy(resolvedLocalForm.policy ?? { kind: "public" }),
      unlockTimeMs: policyUnlockTimeMs(resolvedLocalForm.policy),
      open: resolvedLocalForm.status !== "draft",
    };
  }, [resolvedLocalForm]);

  const activeFormMeta = formMeta ?? fallbackFormMeta;

  const formPolicy = useMemo<FormPolicy>(() => {
    const local = resolvedLocalForm?.policy;
    // Patch a stale local policy that lacks the on-chain object id (older
    // publishes didn't extract it). Chain-side `formMeta` is the source of truth.
    if (local) {
      if (local.kind === "allowlist" && !isObjectId(local.allowlistObjectId) && formMeta?.policyObjectId) {
        return { ...local, allowlistObjectId: formMeta.policyObjectId };
      }
      if (local.kind === "tokenGated" && !isObjectId(local.gateObjectId) && formMeta?.policyObjectId) {
        return { ...local, gateObjectId: formMeta.policyObjectId };
      }
      return local;
    }
    if (!activeFormMeta) return { kind: "public" };
    if (activeFormMeta.policyType === 1) {
      return { kind: "allowlist", allowlistObjectId: activeFormMeta.policyObjectId ?? "" };
    }
    if (activeFormMeta.policyType === 2) {
      return { kind: "timelock", unlockTimeMs: activeFormMeta.unlockTimeMs };
    }
    if (activeFormMeta.policyType === 3) {
      return { kind: "tokenGated", gateObjectId: activeFormMeta.policyObjectId ?? "" };
    }
    return { kind: "public" };
  }, [activeFormMeta, formMeta?.policyObjectId, resolvedLocalForm?.policy]);

  const liveDataError = !activeFormMeta && (formQueryError || schemaError || !realFormId);

  useEffect(() => {
    if (resolvedLocalForm?.schema) {
      setSchema(resolvedLocalForm.schema);
      setSchemaError(null);
      return;
    }
    if (!activeFormMeta?.schemaBlobId) return;
    let cancelled = false;
    (async () => {
      try {
        setSchemaError(null);
        const next = await readJson<FormSchema>(activeFormMeta.schemaBlobId);
        if (!cancelled) setSchema(next);
      } catch (err) {
        if (!cancelled) setSchemaError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeFormMeta?.schemaBlobId, resolvedLocalForm?.schema]);

  useEffect(() => {
    if (!formId || !realFormId) {
      setRows([]);
      return;
    }
    let cancelled = false;

    async function loadSubmissions() {
      const indexed = await readSubmissions(formId ?? "");
      const onchain = await readOnchainSubmissions(client, formId ?? "", activeFormMeta?.policyType ?? 0);
      const indexedIds = new Set(indexed.map((submission) => submission.id));
      const missing = onchain.filter((submission) => !indexedIds.has(submission.id));
      await Promise.all(missing.map((s) => saveSubmission(s, activeFormMeta?.owner)));
      if (cancelled) return;
      const merged = mergeSubmissionRecords(indexed, onchain).map(toRow);
      // Apply optimistic status overrides — but clear them when chain status
      // catches up, so we never leave stale local state on screen.
      const clearedIds: string[] = [];
      const final = merged.map((row) => {
        const pending = optimisticStatus[row.submissionId];
        if (pending === undefined) return row;
        if (row.status === pending) {
          clearedIds.push(row.submissionId);
          return row;
        }
        return { ...row, status: pending };
      });
      if (clearedIds.length) {
        setOptimisticStatus((prev) => {
          const next = { ...prev };
          for (const id of clearedIds) delete next[id];
          return next;
        });
      }
      setRows(final);
    }

    void loadSubmissions();
    const intervalId = window.setInterval(loadSubmissions, 10_000);
    window.addEventListener(SUBMISSIONS_CHANGED_EVENT, loadSubmissions);
    window.addEventListener("focus", loadSubmissions);
    window.addEventListener("storage", loadSubmissions);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener(SUBMISSIONS_CHANGED_EVENT, loadSubmissions);
      window.removeEventListener("focus", loadSubmissions);
      window.removeEventListener("storage", loadSubmissions);
    };
  }, [activeFormMeta?.policyType, client, formId, optimisticStatus, realFormId]);

  async function decryptPayload(row: Row): Promise<Row> {
    if (!formId) throw new Error("Form not loaded.");

    const result = row.encrypted
      ? await readEncryptedOrPlainPayload(row)
      : await readJson<SubmissionPayload>(row.blobId);
    const payload = "payload" in result ? result.payload : result;
    const encrypted = "encrypted" in result ? result.encrypted : row.encrypted;
    const nextRow = { ...row, encrypted, decrypted: true, payload };

    await saveSubmission({
      id: row.submissionId,
      formId,
      submitter: row.submitter,
      status: row.status,
      submittedAtMs: row.submittedAtMs,
      updatedAtMs: Date.now(),
      walrusBlobId: row.blobId,
      suiSubmissionObjectId: isObjectId(row.submissionId) ? row.submissionId : undefined,
      reputationObjectId: row.reputationObjectId,
      encrypted,
      decrypted: true,
      payload,
      fileBlobIds: [],
    });

    return nextRow;
  }

  async function readEncryptedOrPlainPayload(row: Row): Promise<{ payload: SubmissionPayload; encrypted: boolean }> {
    if (!account?.address) {
      throw new Error("Connect the admin wallet to decrypt this submission.");
    }
    if (formPolicy.kind === "allowlist" && !isObjectId(formPolicy.allowlistObjectId)) {
      throw new Error(
        "Allowlist policy object id is missing on this form. The form may have been created under a different package version - re-publish or migrate.",
      );
    }
    if (formPolicy.kind === "tokenGated" && !isObjectId(formPolicy.gateObjectId)) {
      throw new Error("Token-gated policy object id is missing on this form.");
    }

    try {
      const ciphertext = await readBlob(row.blobId);
      const key = await sessionKey.ensure();
      const plaintext = await decryptSubmission({
        ciphertext,
        sessionKey: key,
        policy: formPolicy,
      });
      return { payload: JSON.parse(new TextDecoder().decode(plaintext)) as SubmissionPayload, encrypted: true };
    } catch (sealError) {
      try {
        return { payload: await readJson<SubmissionPayload>(row.blobId), encrypted: false };
      } catch {
        throw sealError;
      }
    }
  }

  async function decryptRow(row: Row) {
    setDecryptingId(row.submissionId);
    setDecryptError(null);
    try {
      const nextRow = await decryptPayload(row);
      setRows((prev) => prev.map((item) => (item.submissionId === row.submissionId ? nextRow : item)));
      setOpenId(row.submissionId);
    } catch (err) {
      setDecryptError(explainDecryptError(err));
    } finally {
      setDecryptingId(null);
    }
  }

  async function decryptAllLocked() {
    if (!formId || !formMeta) return;
    const lockedRows = rows.filter((row) => !row.decrypted);
    if (lockedRows.length === 0) return;
    setAutoDecrypting(true);
    setDecryptError(null);
    try {
      for (const row of lockedRows) {
        attemptedAutoDecryptIds.current.add(row.submissionId);
        if (row.encrypted && !account?.address) continue;
        try {
          const nextRow = await decryptPayload(row);
          setRows((prev) =>
            prev.map((item) => (item.submissionId === row.submissionId ? nextRow : item)),
          );
        } catch (err) {
          setDecryptError(explainDecryptError(err));
        }
      }
    } finally {
      setAutoDecrypting(false);
    }
  }

  const pageTitle = schema?.title ?? activeFormMeta?.title ?? resolvedLocalForm?.title ?? "Form submissions";
  const isFormOwner =
    Boolean(account?.address) &&
    Boolean(activeFormMeta?.owner) &&
    (activeFormMeta?.owner ?? "").toLowerCase() === (account?.address ?? "").toLowerCase();

  // Triager detection: read the on-chain Allowlist members vector and check if
  // current wallet is a member. Owners are NOT considered triagers (they have
  // full owner powers regardless).
  const [isAllowlistMember, setIsAllowlistMember] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setIsAllowlistMember(false);
    if (
      !account?.address ||
      !activeFormMeta ||
      activeFormMeta.policyType !== 1 ||
      !activeFormMeta.policyObjectId ||
      isFormOwner
    ) {
      return;
    }
    void client
      .getObject({ id: activeFormMeta.policyObjectId, options: { showContent: true } })
      .then((response) => {
        if (cancelled) return;
        const content = response.data?.content;
        if (!content || content.dataType !== "moveObject") return;
        const fields = content.fields as Record<string, unknown>;
        const members = Array.isArray(fields.members) ? (fields.members as unknown[]) : [];
        const me = account.address.toLowerCase();
        const found = members.some(
          (member) => typeof member === "string" && member.toLowerCase() === me,
        );
        setIsAllowlistMember(found);
      })
      .catch(() => {
        if (!cancelled) setIsAllowlistMember(false);
      });
    return () => {
      cancelled = true;
    };
  }, [account?.address, activeFormMeta?.policyObjectId, activeFormMeta?.policyType, client, isFormOwner]);

  const isTriager = isAllowlistMember && !isFormOwner;
  const schemaForExport = schema ?? resolvedLocalForm?.schema ?? { version: 1, title: pageTitle, fields: [] };

  const filtered = useMemo(
    () => (statusFilter === "all" ? rows : rows.filter((r) => r.status === statusFilter)),
    [rows, statusFilter],
  );

  const newCount = rows.filter((r) => r.status === 0).length;

  function transition(row: Row, status: number) {
    setRows((prev) => prev.map((r) => (r.submissionId === row.submissionId ? { ...r, status } : r)));
    setOptimisticStatus((prev) => ({ ...prev, [row.submissionId]: status }));
    void updateSubmissionStatus(row.submissionId, status);
    if (typeof window !== "undefined") {
      // Trigger a load tick so chain status is re-fetched once the tx confirms.
      window.dispatchEvent(new Event(SUBMISSIONS_CHANGED_EVENT));
    }
  }

  function handleReceiptMinted(submissionId: string, receiptObjectId: string) {
    setRows((prev) =>
      prev.map((r) => (r.submissionId === submissionId ? { ...r, reputationObjectId: receiptObjectId } : r)),
    );
    if (!formId) return;
    // Read the freshest stored copy so we don't clobber fields written moments
    // ago by sibling callbacks (e.g. handleResolved's resolvedSeverity).
    const stored = readSubmissionsSync(formId).find((s) => s.id === submissionId);
    const target = rows.find((r) => r.submissionId === submissionId);
    if (!target) return;
    void saveSubmission({
      id: target.submissionId,
      formId,
      submitter: target.submitter,
      status: stored?.status ?? target.status,
      submittedAtMs: target.submittedAtMs,
      updatedAtMs: Date.now(),
      walrusBlobId: target.blobId,
      suiSubmissionObjectId: isObjectId(target.submissionId) ? target.submissionId : undefined,
      reputationObjectId: receiptObjectId,
      encrypted: target.encrypted,
      decrypted: target.decrypted,
      payload: target.payload,
      fileBlobIds: stored?.fileBlobIds ?? [],
      resolvedSeverity: stored?.resolvedSeverity ?? target.resolvedSeverity,
    });
  }

  function handleResolved(submissionId: string, chosenSeverity: number) {
    setRows((prev) =>
      prev.map((r) => (r.submissionId === submissionId ? { ...r, resolvedSeverity: chosenSeverity } : r)),
    );
    const target = rows.find((r) => r.submissionId === submissionId);
    if (!target || !formId) return;
    void saveSubmission({
      id: target.submissionId,
      formId,
      submitter: target.submitter,
      status: 3,
      submittedAtMs: target.submittedAtMs,
      updatedAtMs: Date.now(),
      walrusBlobId: target.blobId,
      suiSubmissionObjectId: isObjectId(target.submissionId) ? target.submissionId : undefined,
      reputationObjectId: target.reputationObjectId,
      encrypted: target.encrypted,
      decrypted: target.decrypted,
      payload: target.payload,
      fileBlobIds: [],
      resolvedSeverity: chosenSeverity,
    });
  }

  function forwardWebhooks(row: Row) {
    if (!row.payload) return;
    const count = buildWebhookDeliveries(schemaForExport.integrations?.webhooks, row.payload).length;
    setDeliveries((prev) => ({ ...prev, [row.submissionId]: count }));
  }

  function handleExport() {
    const payloads = filtered.map((r) => r.payload).filter((p): p is SubmissionPayload => Boolean(p));
    const csv = exportCsv(schemaForExport, payloads);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${pageTitle.replace(/\s+/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function grantCurrentWalletAccess() {
    setGrantAccessError(null);
    setGrantAccessMessage(null);
    if (!account?.address) {
      setGrantAccessError("Connect the form owner wallet first.");
      return;
    }
    const policyObjectId = policyObjectIdFromPolicy(formPolicy);
    if (!policyObjectId || formPolicy.kind !== "allowlist") {
      setGrantAccessError("This form does not have an allowlist policy object.");
      return;
    }
    if (!activeFormMeta) {
      setGrantAccessError("Form not yet loaded on chain. Wait a moment and retry.");
      return;
    }
    if (activeFormMeta.owner && activeFormMeta.owner.toLowerCase() !== account.address.toLowerCase()) {
      setGrantAccessError(
        `Only the form owner can update this allowlist. Connect ${truncateAddr(activeFormMeta.owner, 10, 6)} or ask them to add ${truncateAddr(account.address, 10, 6)}.`,
      );
      return;
    }

    setGrantingAccess(true);
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::seal_policies::add_member`,
        arguments: [tx.object(policyObjectId), tx.pure.address(account.address)],
      });
      await signAndExecute({ transaction: tx });
      setGrantAccessMessage("This wallet was added to the Seal allowlist. Try Decrypt again.");
      attemptedAutoDecryptIds.current.clear();
    } catch (err) {
      setGrantAccessError(explainGrantAccessError(err));
    } finally {
      setGrantingAccess(false);
    }
  }

  const triagerUrl =
    typeof window === "undefined"
      ? `/admin/${encodeURIComponent(formId ?? "")}`
      : new URL(`/admin/${encodeURIComponent(formId ?? "")}`, window.location.origin).toString();

  async function handleCopyTriagerLink() {
    await copyText(triagerUrl);
    setCopiedTriagerLink(true);
    setTimeout(() => setCopiedTriagerLink(false), 1500);
  }

  async function handleCopyFormLink() {
    await copyText(submitUrl);
    setCopiedFormLink(true);
    setTimeout(() => setCopiedFormLink(false), 1500);
  }

  async function handleEditForm() {
    if (!schema || !formId) return;
    setFormActionError(null);
    setFormAction("edit");
    try {
      // Cache the live form locally under its real id so BuilderPage can load it.
      // BuilderPage detects `formId` that is NOT a draft and switches into edit
      // mode: the published Form is updated in place via `update_form` instead
      // of publishing a brand new Form (saves the user a duplicate publish cost
      // and keeps the shareable URL stable).
      await saveLocalForm({
        id: formId,
        title: schema.title || pageTitle,
        status: "published",
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
        schema,
        policy: formPolicy,
        webhooks: schema.integrations?.webhooks,
      });
      navigate(`/builder/${encodeURIComponent(formId)}`);
    } catch (err) {
      setFormActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setFormAction(null);
    }
  }

  async function handleDeleteForm() {
    if (!formId) return;
    if (!window.confirm("Delete this form on-chain and remove it from the dashboard? Existing submissions stay archived in admin.")) {
      return;
    }
    setFormActionError(null);
    if (formMeta && account?.address && formMeta.owner && formMeta.owner.toLowerCase() !== account.address.toLowerCase()) {
      setFormActionError(
        `Connect ${truncateAddr(formMeta.owner, 10, 6)} to delete this form on-chain.`,
      );
      return;
    }
    setFormAction("delete");
    try {
      const objectPackage = formMeta?.objectPackage ?? "";
      const currentPackage = PACKAGE_ID.toLowerCase();
      const samePackage =
        objectPackage && currentPackage && objectPackage.toLowerCase() === currentPackage;
      if (formMeta && realFormId && samePackage) {
        const tx = new Transaction();
        tx.moveCall({
          target: `${PACKAGE_ID}::form_registry::close_form`,
          arguments: [tx.object(formId)],
        });
        await signAndExecute({ transaction: tx });
      } else if (formMeta && realFormId && objectPackage && !samePackage) {
        if (
          !window.confirm(
            `This form was created under an older contract version (${objectPackage.slice(0, 10)}…). ` +
              `On-chain close cannot run against the current package. Remove from the dashboard only?`,
          )
        ) {
          setFormAction(null);
          return;
        }
      }
      await deleteLocalForm(formId);
      navigate("/dashboard");
    } catch (err) {
      setFormActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setFormAction(null);
    }
  }

  return (
    <AppShell
      action={
        <Button variant="outline" leftIcon={<Download className="h-4 w-4" />} onClick={handleExport}>
          Export CSV
        </Button>
      }
    >
      <PageHeader
        eyebrow="Submissions"
        title={pageTitle}
        description={`${rows.length} total · ${newCount} new`}
        action={
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select
              value={String(statusFilter)}
              onChange={(e) => setStatusFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
              className="w-44"
            >
              <option value="all">All statuses</option>
              {STATUS.map((s, i) => (
                <option key={i} value={i}>{s}</option>
              ))}
            </Select>
          </div>
        }
      />

      <ConnectGate message="Connect the form-owner wallet to view submissions.">
      <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Share2 className="h-4 w-4 text-primary" />
            Public form link
          </div>
          <div className="mt-2 rounded-lg border border-border bg-background-soft px-3 py-2 font-mono text-xs text-muted-foreground break-all">
            {submitUrl}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              leftIcon={copiedFormLink ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              onClick={handleCopyFormLink}
            >
              {copiedFormLink ? "Copied" : "Copy"}
            </Button>
            <a
              href={submitUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-medium tracking-tight transition-all duration-200",
                "bg-primary text-primary-foreground hover:opacity-95 active:opacity-90 shadow-sm",
              )}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open
            </a>
            {isFormOwner && activeFormMeta?.policyType === 1 ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                leftIcon={copiedTriagerLink ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                onClick={handleCopyTriagerLink}
              >
                {copiedTriagerLink ? "Copied" : "Copy triager link"}
              </Button>
            ) : null}
          </div>
        </Card>

        {(formMeta || resolvedLocalForm) && isFormOwner && (
          <Card className="p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Pencil className="h-4 w-4 text-primary" />
              Form actions
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Edit updates the form in place (same shareable link). Delete closes it on chain.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                leftIcon={<Pencil className="h-3.5 w-3.5" />}
                disabled={!schema || formAction === "edit"}
                onClick={() => void handleEditForm()}
              >
                {formAction === "edit" ? "Preparing…" : "Edit form"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                disabled={formAction === "delete"}
                onClick={() => void handleDeleteForm()}
              >
                {formAction === "delete" ? "Deleting…" : "Delete form"}
              </Button>
            </div>
            {formActionError && (
              <p className="mt-3 text-xs text-destructive">{formActionError}</p>
            )}
          </Card>
        )}
      </div>

      {isTriager ? (
        <Card className="mb-5 p-4 border-tertiary/40 bg-tertiary/5">
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 shrink-0 rounded-full bg-tertiary/15 text-tertiary-strong dark:text-tertiary flex items-center justify-center">
              <Eye className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-medium">Triager view · read-only</div>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                You're on this form's Seal allowlist, so you can read every decrypted submission.
                Status changes, edits, and deletes stay with the form owner.
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      {liveDataError && (
        <Card className="mb-5 p-4 border-tertiary/30 bg-tertiary/10">
          <div className="text-sm font-medium text-tertiary-strong dark:text-tertiary">
            Live form data is not loaded
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {!realFormId
              ? "This admin route is not a valid published Sui Form object id. Publish from the builder or open a saved form from the dashboard."
              : formQueryError?.message ?? schemaError}
          </p>
        </Card>
      )}

      {decryptError && (
        <Card className="mb-5 p-4 border-destructive/30 bg-destructive/10 text-sm">
          <div className="font-medium text-destructive">Cannot decrypt this submission</div>
          <p className="mt-1 text-destructive">{decryptError}</p>
          {formPolicy.kind === "allowlist" && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                leftIcon={<UserPlus className="h-3.5 w-3.5" />}
                disabled={grantingAccess}
                onClick={grantCurrentWalletAccess}
              >
                {grantingAccess ? "Granting access…" : "Add my wallet to the Seal allowlist"}
              </Button>
              {policyObjectIdFromPolicy(formPolicy) && (
                <span className="font-mono text-[11px] text-muted-foreground">
                  Allowlist {truncateAddr(policyObjectIdFromPolicy(formPolicy) ?? "", 10, 6)}
                </span>
              )}
            </div>
          )}
          {grantAccessMessage && (
            <p className="mt-3 text-sm text-secondary-strong dark:text-secondary">{grantAccessMessage}</p>
          )}
          {grantAccessError && (
            <p className="mt-3 text-sm text-destructive">{grantAccessError}</p>
          )}
        </Card>
      )}

      {(() => {
        const lockedCount = rows.filter((r) => !r.decrypted).length;
        if (lockedCount === 0 && !autoDecrypting) return null;
        return (
          <Card className="mb-5 p-4 border-tertiary/30 bg-tertiary/10 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-tertiary/15 text-tertiary-strong dark:text-tertiary flex items-center justify-center">
                <Lock className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-medium">
                  {autoDecrypting
                    ? "Batch-decrypting all submissions in one session…"
                    : `${lockedCount} encrypted submission${lockedCount === 1 ? "" : "s"} ready to unlock`}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Sign once with Seal - every locked row decrypts in the same batch.
                </div>
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              disabled={autoDecrypting || lockedCount === 0}
              leftIcon={autoDecrypting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
              onClick={() => void decryptAllLocked()}
            >
              {autoDecrypting ? "Decrypting…" : `Decrypt all (${lockedCount})`}
            </Button>
          </Card>
        );
      })()}

      <SubmissionMetrics rows={rows} />

      <Card className="p-0 overflow-hidden">
        <div className="grid grid-cols-[1.4fr_1fr_1fr_2fr_180px] text-[11px] uppercase tracking-widest text-muted-foreground/80 px-6 py-3 border-b border-border/60">
          <div>Submitter</div>
          <div>Submitted</div>
          <div>Status</div>
          <div>Preview</div>
          <div>Actions</div>
        </div>
        <ul>
          {filtered.length === 0 && (
            <li className="px-6 py-12 text-center text-muted-foreground">
              <p className="font-serif italic text-2xl">No submissions yet.</p>
              <p className="mt-2 text-sm">
                Open the submitter form link above and submit the first response.
              </p>
            </li>
          )}
          {filtered.map((row) => (
            <li key={row.submissionId} className="border-b border-border/40 last:border-0">
              <div
                role="button"
                tabIndex={0}
                aria-expanded={openId === row.submissionId}
                onClick={() => setOpenId(openId === row.submissionId ? null : row.submissionId)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setOpenId(openId === row.submissionId ? null : row.submissionId);
                  }
                }}
                className={cn(
                  "group relative w-full grid grid-cols-[1.4fr_1fr_1fr_2fr_180px] items-center gap-3 px-6 py-4 text-left cursor-pointer transition-all duration-200",
                  "hover:bg-primary/[0.06] hover:shadow-[inset_2px_0_0_var(--primary),0_0_24px_-8px_var(--primary)]",
                  openId === row.submissionId && "bg-primary/[0.08] shadow-[inset_2px_0_0_var(--primary)]",
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-7 w-7 shrink-0 rounded-full bg-gradient-to-br from-primary via-secondary to-tertiary" />
                  <div className="min-w-0">
                    <SubmitterName address={row.submitter} />
                    <div className="font-mono text-[10px] text-muted-foreground truncate">{truncateBlob(row.blobId, 14)}</div>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">{relativeTime(row.submittedAtMs)}</div>
                <div>
                  <Badge tone={STATUS_TONE[row.status]} icon={<StatusDot tone={STATUS_TONE[row.status]} />}>
                    {STATUS[row.status]}
                  </Badge>
                </div>
                <div className="text-sm truncate">
                  {row.decrypted && row.payload ? (
                    Object.values(row.payload.values)
                      .map((v) => (v.type === "text" || v.type === "url" || v.type === "dropdown" ? v.value : ""))
                      .filter(Boolean)
                      .join(" · ")
                      .slice(0, 100)
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-tertiary-strong dark:text-tertiary">
                      <Lock className="h-3.5 w-3.5" /> locked
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 justify-start">
                  {deliveries[row.submissionId] ? (
                    <Badge tone="secondary">{deliveries[row.submissionId]} sent</Badge>
                  ) : null}
                  {!row.decrypted && (
                    <Button
                      size="sm"
                      variant="outline"
                      leftIcon={<Eye className="h-3.5 w-3.5" />}
                      disabled={autoDecrypting || decryptingId === row.submissionId}
                      onClick={(event) => {
                        event.stopPropagation();
                        void decryptRow(row);
                      }}
                    >
                      {autoDecrypting || decryptingId === row.submissionId ? "Decrypting..." : "Decrypt"}
                    </Button>
                  )}
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 text-muted-foreground transition-transform",
                      openId === row.submissionId && "rotate-180",
                    )}
                  />
                </div>
              </div>
              {openId === row.submissionId && row.payload && (
                <Drawer
                  schema={schemaForExport}
                  row={row}
                  onTransition={(s) => transition(row, s)}
                  onForward={() => forwardWebhooks(row)}
                  isFormOwner={isFormOwner}
                  formObjectId={isObjectId(formId) ? formId : undefined}
                  formOwner={activeFormMeta?.owner}
                  onReceiptMinted={handleReceiptMinted}
                  onResolved={handleResolved}
                />
              )}
            </li>
          ))}
        </ul>
      </Card>
      </ConnectGate>
    </AppShell>
  );
}

function toRow(record: StoredSubmissionRecord): Row {
  return {
    submissionId: record.id,
    submitter: record.submitter,
    status: record.status,
    submittedAtMs: record.submittedAtMs,
    blobId: record.walrusBlobId,
    encrypted: record.encrypted,
    decrypted: record.decrypted,
    reputationObjectId: record.reputationObjectId,
    payload: record.payload,
    resolvedSeverity: record.resolvedSeverity,
  };
}

function mergeSubmissionRecords(
  indexed: StoredSubmissionRecord[],
  onchain: StoredSubmissionRecord[],
): StoredSubmissionRecord[] {
  const byId = new Map<string, StoredSubmissionRecord>();
  for (const record of onchain) byId.set(record.id, record);
  for (const record of indexed) {
    const existing = byId.get(record.id);
    byId.set(record.id, {
      ...existing,
      ...record,
      // Chain status wins when we have a real Submission object — old local
      // cache writes can no longer falsely advance state to Resolved.
      status: existing && existing.suiSubmissionObjectId ? existing.status : record.status,
      payload: record.payload ?? existing?.payload,
      decrypted: record.decrypted || Boolean(existing?.decrypted),
    });
  }
  return [...byId.values()].sort((a, b) => b.submittedAtMs - a.submittedAtMs);
}

async function readOnchainSubmissions(
  client: ReturnType<typeof useSuiClient>,
  formId: string,
  policyType: number,
): Promise<StoredSubmissionRecord[]> {
  if (!PACKAGE_CONFIGURED) return [];

  const records: StoredSubmissionRecord[] = [];
  let cursor: Parameters<typeof client.queryEvents>[0]["cursor"] = null;

  for (let page = 0; page < 200; page += 1) {
    const response = await client.queryEvents({
      query: { MoveEventType: `${PACKAGE_ID}::submission::SubmissionCreated` },
      cursor,
      limit: 50,
      order: "descending",
    });

    for (const event of response.data) {
      const parsed = event.parsedJson;
      if (!parsed || typeof parsed !== "object") continue;
      const eventFormId = eventFieldString((parsed as Record<string, unknown>).form_id);
      if (eventFormId !== formId) continue;

      const submissionId = eventFieldString((parsed as Record<string, unknown>).submission_id);
      const submitter = eventFieldString((parsed as Record<string, unknown>).submitter);
      const blobId = eventFieldString((parsed as Record<string, unknown>).blob_id);
      const submittedAtMs = Number((parsed as Record<string, unknown>).submitted_at_ms ?? Date.now());
      if (!submissionId || !submitter || !blobId) continue;

      const payload = policyType === 0 ? await readPublicSubmissionPayload(blobId) : undefined;
      records.push({
        id: submissionId,
        formId,
        submitter,
        status: 0,
        submittedAtMs,
        updatedAtMs: submittedAtMs,
        walrusBlobId: blobId,
        suiSubmissionObjectId: submissionId,
        txDigest: event.id.txDigest,
        encrypted: policyType !== 0,
        decrypted: Boolean(payload),
        payload,
        fileBlobIds: [],
      });
    }

    if (!response.hasNextPage || !response.nextCursor) break;
    cursor = response.nextCursor;
  }

  // Hydrate the real on-chain `Submission.status` so triaged / resolved
  // transitions are visible without trusting stale local cache writes.
  await hydrateOnchainStatus(client, records);

  return records;
}

async function hydrateOnchainStatus(
  client: ReturnType<typeof useSuiClient>,
  records: StoredSubmissionRecord[],
): Promise<void> {
  if (records.length === 0) return;
  const BATCH = 50;
  for (let i = 0; i < records.length; i += BATCH) {
    const slice = records.slice(i, i + BATCH);
    const ids = slice.map((r) => r.id);
    const response = await client.multiGetObjects({
      ids,
      options: { showContent: true },
    });
    for (let j = 0; j < response.length; j += 1) {
      const data = response[j]?.data;
      const content = data?.content;
      if (!content || content.dataType !== "moveObject") continue;
      const fields = content.fields as Record<string, unknown>;
      const status = Number(fields.status);
      if (Number.isFinite(status)) slice[j].status = status;
    }
  }
}

async function readPublicSubmissionPayload(blobId: string): Promise<SubmissionPayload | undefined> {
  try {
    const payload = await readJson<SubmissionPayload>(blobId);
    return payload?.version === 1 ? payload : undefined;
  } catch {
    return undefined;
  }
}

function eventFieldString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === "string" ? id : undefined;
  }
  return undefined;
}

function policyObjectIdFromField(value: unknown): string | undefined {
  let bytes: Uint8Array | undefined;
  if (Array.isArray(value)) {
    const nums = value.filter((item): item is number => typeof item === "number");
    if (nums.length) bytes = Uint8Array.from(nums);
  } else if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    if (/^0x[0-9a-f]+$/i.test(trimmed)) {
      const hex = trimmed.slice(2);
      bytes = Uint8Array.from(hex.match(/.{1,2}/g)?.map((h) => parseInt(h, 16)) ?? []);
    } else if (/^[0-9a-f]+$/i.test(trimmed) && trimmed.length % 2 === 0) {
      bytes = Uint8Array.from(trimmed.match(/.{1,2}/g)?.map((h) => parseInt(h, 16)) ?? []);
    } else {
      try {
        const binary = atob(trimmed);
        bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      } catch {
        return undefined;
      }
    }
  }
  if (!bytes || bytes.length !== 32) return undefined;
  return `0x${toHex(bytes)}`;
}


function SubmitterName({ address }: { address: string }) {
  const isAnon = address.startsWith("anon:");
  const looksLikeAddress = /^0x[0-9a-fA-F]{4,}$/.test(address);
  const { data: name } = useResolveSuiNSName(looksLikeAddress ? address : "", { staleTime: 60_000 });
  if (isAnon) {
    return (
      <div className="text-xs truncate">
        <span className="font-mono text-muted-foreground">{address}</span>
      </div>
    );
  }
  return (
    <div className="text-xs truncate">
      {name ? <span className="font-medium">{name}</span> : <span className="font-mono">{truncateAddr(address)}</span>}
    </div>
  );
}

function Drawer({
  schema,
  row,
  onTransition,
  onForward,
  isFormOwner,
  formObjectId,
  formOwner,
  onReceiptMinted,
  onResolved,
}: {
  schema: FormSchema;
  row: Row;
  onTransition: (s: number) => void;
  onForward: () => void;
  isFormOwner: boolean;
  formObjectId: string | undefined;
  formOwner: string | undefined;
  onReceiptMinted: (submissionId: string, receiptObjectId: string) => void;
  onResolved: (submissionId: string, severity: number) => void;
}) {
  const client = useSuiClient();
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction<SuiTransactionBlockResponse>({
    execute: ({ bytes, signature }) =>
      client.executeTransactionBlock({
        transactionBlock: bytes,
        signature,
        options: {
          showEffects: true,
          showEvents: true,
          showObjectChanges: true,
        },
      }),
  });
  const [chainError, setChainError] = useState<string | null>(null);
  const [chainInfo, setChainInfo] = useState<string | null>(null);
  const [resolveDigest, setResolveDigest] = useState<string | null>(null);
  const [severity, setSeverity] = useState<number>(row.resolvedSeverity ?? 1);
  const receiptObjectId = row.reputationObjectId ?? "";

  if (!row.payload) return null;

  const reputation = calculateReputation(row.submitter, row.payload);
  const reputationEnabled = Boolean(schema.reputation?.enabled);
  const webhookCount = buildWebhookDeliveries(schema.integrations?.webhooks, row.payload).length;
  const submitterIsSuiAddress = isObjectId(row.submitter);
  const canUseChain = PACKAGE_CONFIGURED && submitterIsSuiAddress;
  const bountyEnabled = Boolean(schema.bounty?.enabled !== false && schema.bounty?.tiers);
  const canReleaseBounty = Boolean(PACKAGE_CONFIGURED && bountyEnabled && submitterIsSuiAddress);

  async function bountyPayoutCoinIfWal(): Promise<string | undefined> {
    if (schema.bounty?.tokenSymbol !== "WAL") return undefined;
    if (!account?.address) throw new Error("Connect the form owner wallet first.");
    const coins = await client.getCoins({ owner: account.address, coinType: WAL_COIN_TYPE, limit: 50 });
    if (!coins.data.length) throw new Error("No WAL coin in wallet to pay this bounty. Swap SUI → WAL in Settings first.");
    return coins.data[0].coinObjectId;
  }

  function tierAmountMistOrNull(): bigint | null {
    if (!schema.bounty?.tiers) return null;
    try {
      const tiers = tiersFromStrings(schema.bounty.tiers);
      return tierAmountForSeverity(tiers, severity);
    } catch {
      return null;
    }
  }

  async function releaseBounty() {
    if (!bountyEnabled) return;
    const amount = tierAmountMistOrNull();
    if (amount === null) {
      setChainError("Bounty tier amounts are invalid.");
      return;
    }
    if (amount <= 0n) {
      setChainInfo(`No payout configured for severity ${SEVERITY_LABELS[severity]}.`);
      return;
    }
    setChainError(null);
    try {
      const walCoinObjectId = await bountyPayoutCoinIfWal();
      const tx = new TxnBuilder();
      appendBountyPayout(tx, {
        recipient: row.submitter,
        amountMist: amount,
        tokenSymbol: schema.bounty!.tokenSymbol,
        walCoinObjectId,
      });
      await signAndExecute({ transaction: tx });
      setChainInfo(`Paid ${formatMist(amount)} ${schema.bounty!.tokenSymbol} at severity ${SEVERITY_LABELS[severity]}.`);
    } catch (err) {
      setChainError(err instanceof Error ? err.message : String(err));
    }
  }

  async function castVote(votes: number) {
    if (!schema.featureVoting?.votingObjectId || !isObjectId(row.submissionId)) return;
    setChainError(null);
    try {
      await signAndExecute({
        transaction: buildCastRoadmapVoteTx(schema.featureVoting.votingObjectId, row.submissionId, votes),
      });
    } catch (err) {
      setChainError(err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Mint the soulbound `SubmissionReceipt` to the submitter on resolve. Skips
   * silently when:
   *   - reputation is disabled on the form
   *   - submitter is the form owner (Move would abort anyway)
   *   - form / submission not on chain yet (preview or pre-publish state)
   * Bundles a bounty release into the same PTB if a tiered bounty is configured.
   */
  /**
   * Resolve PTB. Always appends `triage::transition` when the form + submission
   * exist on chain so the click produces a real, signed transaction. Mints the
   * soulbound receipt + releases bounty in the same PTB when configured.
   */
  async function resolveOnChain(targetStatus: number) {
    const formObj = formObjectId;
    const submissionObjectId = row.submissionId;
    const onChain = isObjectId(formObj) && isObjectId(submissionObjectId);
    if (!onChain) {
      setChainInfo("Status updated locally. Publish the form on chain to record this transition.");
      return;
    }
    if (row.status === targetStatus) {
      setChainInfo(`Already ${STATUS[targetStatus]}.`);
      return;
    }
    const isResolve = targetStatus === 3;
    const isSelfSubmission =
      row.submitter && formOwner && row.submitter.toLowerCase() === formOwner.toLowerCase();
    const tierAmount = isResolve ? tierAmountMistOrNull() : null;
    const payBounty = Boolean(isResolve && bountyEnabled && !isSelfSubmission && tierAmount && tierAmount > 0n);
    setChainError(null);
    setChainInfo(null);
    try {
      const walCoinObjectId = payBounty ? await bountyPayoutCoinIfWal() : undefined;
      const tx = new TxnBuilder();
      tx.moveCall({
        target: `${PACKAGE_ID}::triage::transition`,
        arguments: [tx.object(formObj!), tx.object(submissionObjectId), tx.pure.u8(targetStatus)],
      });
      const mintReceipt = isResolve && reputationEnabled && !isSelfSubmission;
      if (mintReceipt) {
        appendMintReceipt(tx, { formObjectId: formObj!, submissionObjectId, severity });
      }
      if (payBounty) {
        appendBountyPayout(tx, {
          recipient: row.submitter,
          amountMist: tierAmount!,
          tokenSymbol: schema.bounty!.tokenSymbol,
          walCoinObjectId,
        });
      }
      const result = await signAndExecute({ transaction: tx });
      if (typeof result.digest === "string") setResolveDigest(result.digest);
      // Nudge the parent loader so it picks up the just-confirmed chain status.
      if (typeof window !== "undefined") {
        window.setTimeout(() => window.dispatchEvent(new Event(SUBMISSIONS_CHANGED_EVENT)), 1200);
      }
      if (isResolve) {
        onResolved(submissionObjectId, severity);
      }
      if (mintReceipt) {
        const minted = extractReceiptObjectId(result);
        if (minted) onReceiptMinted(submissionObjectId, minted);
      }
      const parts: string[] = [`status → ${STATUS[targetStatus]}`];
      if (mintReceipt) parts.push(`receipt minted (${SEVERITY_LABELS[severity]})`);
      if (payBounty) parts.push(`paid ${formatMist(tierAmount!)} ${schema.bounty!.tokenSymbol}`);
      if (isResolve && isSelfSubmission) parts.push("self-submission - skipped receipt + bounty");
      setChainInfo(parts.join(" · ") + ".");
    } catch (err) {
      setChainError(err instanceof Error ? err.message : String(err));
    }
  }

  function transitionStatus(status: number) {
    onTransition(status);
    // Only the resolve action signs a PTB. Other status changes (Triaged,
    // In Progress) stay local so the dropdown doesn't pop the wallet on every
    // pick. Use the "Mark resolved" button to commit on chain.
    if (status === 3) void resolveOnChain(status);
  }

  return (
    <div className="px-6 py-6 bg-background-soft border-t border-border/40">
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Submission</div>
          <div className="grid gap-4">
            {schema.fields.map((f) => {
              const v = row.payload?.values[f.id];
              return (
                <div key={f.id}>
                  <div className="text-[11px] uppercase tracking-widest text-muted-foreground/70">{f.label}</div>
                  <div className="mt-1 text-sm">
                    {!v && <span className="text-muted-foreground italic">— empty —</span>}
                    {v?.type === "text" && (
                      f.type === "richText" || f.type === "longText" ? (
                        <MarkdownView src={v.value} />
                      ) : (
                        v.value
                      )
                    )}
                    {v?.type === "url" && (
                      <a href={v.value} className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
                        {v.value}
                      </a>
                    )}
                    {v?.type === "dropdown" && (
                      <span
                        className={
                          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium leading-none " +
                          severityBadgeClass(v.value)
                        }
                      >
                        {v.value}
                      </span>
                    )}
                    {v?.type === "checkbox" && v.value.join(", ")}
                    {v?.type === "stars" && "★".repeat(v.value)}
                    {v?.type === "file" && (
                      <span className="font-mono text-xs">{truncateBlob(v.blobId, 18)}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {row.suiSubmissionObjectId ? (
            <div className="mt-5">
              <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
                Walrus storage
              </div>
              <WalrusBlobStatus
                blobObjectId={row.suiSubmissionObjectId}
                blobId={row.blobId}
                canExtend={isFormOwner}
              />
            </div>
          ) : null}
          {row.txDigest ? (
            <a
              href={`https://suiscan.xyz/${NETWORK}/tx/${row.txDigest}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"
            >
              View on Suiscan <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
        </div>

        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Triage</div>
          {reputationEnabled && (
          <div className="mb-4 rounded-lg border border-border bg-background px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Submitter signal</div>
                <div className="mt-1 text-sm font-medium">{reputation.signal}</div>
              </div>
              <Badge tone={reputation.level === "expert" ? "secondary" : reputation.level === "trusted" ? "primary" : "neutral"}>
                {reputation.score}
              </Badge>
            </div>
            <div className="mt-3 rounded-md border border-border bg-background-soft px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-medium">
                    {receiptObjectId ? "Soulbound receipt minted" : "Receipt mints on resolve"}
                  </div>
                  <div className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                    {receiptObjectId ? (
                      <span className="inline-flex items-center gap-1.5">
                        The submitter holds an on-chain SubmissionReceipt for this report.
                        <a
                          href={`https://suiscan.xyz/${NETWORK}/object/${receiptObjectId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open on Suiscan"
                          className="inline-flex items-center text-primary hover:opacity-80"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </span>
                    ) : (
                      "Marking this report resolved mints a soulbound receipt to the submitter."
                    )}
                  </div>
                </div>
                <StatusDot tone={receiptObjectId ? "secondary" : "neutral"} />
              </div>
              {receiptObjectId && (
                <div className="mt-2 truncate font-mono text-[10px] text-muted-foreground">
                  {truncateAddr(receiptObjectId, 10, 8)}
                </div>
              )}
            </div>
            <div className="mt-3 grid gap-2">
              {!PACKAGE_CONFIGURED && (
                <div className="rounded-md border border-tertiary/30 bg-tertiary/10 px-2 py-2 text-xs text-tertiary-strong dark:text-tertiary">
                  On-chain actions are disabled because `PACKAGE_ID` is still `0x0`. Publish contracts and update `app/src/config.ts`.
                </div>
              )}
              {PACKAGE_CONFIGURED && !submitterIsSuiAddress && (
                <div className="rounded-md border border-tertiary/30 bg-tertiary/10 px-2 py-2 text-xs text-tertiary-strong dark:text-tertiary">
                  This submitter is not a Sui address, so on-chain reputation actions are unavailable.
                </div>
              )}
              {!receiptObjectId && reputationEnabled && (
                <div className="rounded-md border border-tertiary/30 bg-tertiary/10 px-2 py-2 text-xs text-tertiary-strong dark:text-tertiary">
                  The soulbound receipt is minted to the submitter when you mark this resolved.
                </div>
              )}
              {chainInfo && (
                <div className="rounded-md border border-secondary/30 bg-secondary/10 px-2 py-2 text-xs text-secondary-strong dark:text-secondary">
                  {chainInfo}
                </div>
              )}
            </div>
          </div>
          )}
          {(reputationEnabled || bountyEnabled) && (() => {
            let parsedTiers: ReturnType<typeof tiersFromStrings> | null = null;
            if (bountyEnabled && schema.bounty?.tiers) {
              try {
                parsedTiers = tiersFromStrings(schema.bounty.tiers);
              } catch {
                parsedTiers = null;
              }
            }
            const tokenSymbol = schema.bounty?.tokenSymbol ?? "WAL";
            const selectedAmount = parsedTiers ? tierAmountForSeverity(parsedTiers, severity) : 0n;
            return (
              <div className="mb-3">
                <label className="block text-[11px] uppercase tracking-widest text-muted-foreground mb-1">
                  Severity (used for receipt / bounty)
                </label>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                  {SEVERITY_LABELS.map((label, i) => {
                    const amount = parsedTiers ? tierAmountForSeverity(parsedTiers, i) : null;
                    const active = severity === i;
                    const locked = !isFormOwner || row.status === 3;
                    return (
                      <button
                        key={label}
                        type="button"
                        disabled={locked}
                        title={row.status === 3 ? "Resolved - severity locked." : undefined}
                        onClick={() => setSeverity(i)}
                        className={cn(
                          "rounded-md border px-2 py-1.5 text-left text-xs transition-all",
                          severityBadgeClass(label),
                          active
                            ? "ring-2 ring-offset-1 ring-offset-background ring-current"
                            : locked
                              ? "opacity-50"
                              : "opacity-70 hover:opacity-100",
                          locked && "cursor-not-allowed pointer-events-none",
                        )}
                      >
                        <div className="text-[11px] font-semibold uppercase tracking-wider">{label}</div>
                        {bountyEnabled && amount !== null && (
                          <div className="mt-0.5 font-mono text-[10px] opacity-80">
                            {formatMist(amount)} {tokenSymbol}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
                {bountyEnabled && parsedTiers && (
                  <div className="mt-2 flex items-center justify-between gap-3 rounded-md border border-secondary/30 bg-secondary/10 px-3 py-2 text-xs">
                    <span className="text-muted-foreground">Payout on resolve</span>
                    <span className="font-mono font-medium text-secondary-strong dark:text-secondary">
                      {formatMist(selectedAmount)} {tokenSymbol}
                    </span>
                  </div>
                )}
              </div>
            );
          })()}
          {row.status === 3 ? (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-md border border-border bg-background-soft px-3 py-2">
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Status</div>
              <Badge tone={STATUS_TONE[row.status]}>{STATUS[row.status]}</Badge>
            </div>
          ) : (
            <div className="mb-3">
              <label className="block text-[11px] uppercase tracking-widest text-muted-foreground mb-1">
                Status
              </label>
              <Select
                value={row.status}
                disabled={!isFormOwner}
                onChange={(e) => onTransition(Number(e.target.value))}
              >
                {STATUS.map((s, i) =>
                  i === 3 ? null : (
                    <option key={i} value={i}>
                      {s}
                    </option>
                  ),
                )}
              </Select>
            </div>
          )}
          {row.status === 3 && (resolveDigest || row.txDigest) ? (
            <a
              href={`https://suiscan.xyz/${NETWORK}/tx/${resolveDigest ?? row.txDigest}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-background-soft px-3 text-sm font-medium text-foreground hover:border-primary/50 hover:text-primary transition-colors"
            >
              View on Explorer <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              className="w-full"
              disabled={!isFormOwner || row.status === 3}
              title={
                !isFormOwner
                  ? "Only the form owner can resolve."
                  : row.status === 3
                    ? "Already resolved."
                    : undefined
              }
              onClick={() => transitionStatus(3)}
            >
              {bountyEnabled ? "Resolve & pay submitter" : "Resolve submission"}
            </Button>
          )}
          {schema.integrations?.webhooks?.length ? (
            <Button
              size="sm"
              variant="outline"
              className="mt-3 w-full"
              leftIcon={<Send className="h-3.5 w-3.5" />}
              onClick={onForward}
            >
              Forward to {webhookCount} webhook{webhookCount === 1 ? "" : "s"}
            </Button>
          ) : null}
          {schema.featureVoting?.enabled ? (
            <VoteControls
              quadratic={schema.featureVoting.quadratic}
              executable={Boolean(PACKAGE_CONFIGURED && schema.featureVoting.votingObjectId && isObjectId(row.submissionId))}
              onCast={castVote}
            />
          ) : null}
          {schema.bounty?.enabled && Number(schema.bounty.payoutAmount) > 0 ? (
            <div className="mt-4 rounded-lg border border-secondary/40 bg-secondary/10 px-3 py-3 text-sm">
              <div className="flex items-center gap-2 font-medium">
                <Sparkles className="h-3.5 w-3.5" />
                {schema.bounty.payoutAmount} {schema.bounty.tokenSymbol} bounty
              </div>
              <div className="mt-1 text-xs text-muted-foreground">Payout can be released from the Move escrow after resolution.</div>
              <Button
                size="sm"
                variant="secondary"
                className="mt-3 w-full"
                disabled={!canReleaseBounty}
                onClick={releaseBounty}
              >
                Release escrow
              </Button>
            </div>
          ) : null}
          {chainError && (
            <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {chainError}
            </div>
          )}
          <div className="mt-6 text-xs uppercase tracking-widest text-muted-foreground mb-2">Audit log</div>
          <div className="space-y-2 text-xs text-muted-foreground">
            <div className="flex gap-2 items-start">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
              <div>Submitted · {relativeTime(row.submittedAtMs)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function VoteControls({
  quadratic,
  executable,
  onCast,
}: {
  quadratic: boolean;
  executable: boolean;
  onCast: (votes: number) => void;
}) {
  const [votes, setVotes] = useState(1);
  const credits = quadratic ? creditsForVotes(votes) : votes;
  return (
    <div className="mt-4 rounded-lg border border-border bg-background px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Vote className="h-3.5 w-3.5 text-tertiary-strong dark:text-tertiary" />
          Roadmap votes
        </div>
        <Badge tone="tertiary">{votesFromCredits(credits)} vote{votes === 1 ? "" : "s"}</Badge>
      </div>
      <input
        type="range"
        min={1}
        max={10}
        value={votes}
        onChange={(e) => setVotes(Number(e.target.value))}
        className="mt-3 w-full accent-primary"
      />
      <div className="mt-1 text-xs text-muted-foreground">
        {quadratic ? `${credits} credits spent quadratically` : `${credits} credits spent linearly`}
      </div>
      <Button
        size="sm"
        variant="outline"
        className="mt-3 w-full"
        disabled={!executable}
        onClick={() => onCast(votes)}
      >
        Cast on-chain vote
      </Button>
    </div>
  );
}

/**
 * Standard risk-style colors for severity / impact / priority dropdown values:
 *   green  → Low / Pass / Approved
 *   yellow → Medium / Moderate
 *   orange → High / Severe
 *   red    → Critical / Blocker / Fail / Rejected
 * Anything else gets a neutral slate.
 */
function severityBadgeClass(value: string): string {
  const v = value.trim().toLowerCase();
  if (["critical", "blocker", "urgent", "p0", "fail", "rejected", "no"].includes(v)) {
    return "bg-red-100 text-red-700 border-red-300 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/40";
  }
  if (["high", "severe", "p1", "high impact"].includes(v)) {
    return "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-500/15 dark:text-orange-400 dark:border-orange-500/40";
  }
  if (["medium", "med", "p2", "moderate"].includes(v)) {
    return "bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-500/15 dark:text-yellow-300 dark:border-yellow-500/40";
  }
  if (["low", "minor", "trivial", "p3", "p4", "pass", "approved", "yes", "ok"].includes(v)) {
    return "bg-green-100 text-green-700 border-green-300 dark:bg-green-500/15 dark:text-green-400 dark:border-green-500/40";
  }
  return "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-500/15 dark:text-slate-300 dark:border-slate-500/40";
}

function isObjectId(value: string | undefined): value is string {
  return Boolean(value && /^0x[0-9a-fA-F]{64}$/.test(value));
}

function policyKindToNumber(policy: FormPolicy | undefined): number {
  if (!policy) return 0;
  if (policy.kind === "allowlist") return 1;
  if (policy.kind === "timelock") return 2;
  if (policy.kind === "tokenGated") return 3;
  return 0;
}

function policyUnlockTimeMs(policy: FormPolicy | undefined): bigint {
  if (policy?.kind === "timelock") return policy.unlockTimeMs;
  return 0n;
}

function policyObjectIdFromPolicy(policy: FormPolicy): string | undefined {
  if (policy.kind === "allowlist") return policy.allowlistObjectId;
  if (policy.kind === "tokenGated") return policy.gateObjectId;
  return undefined;
}

function explainDecryptError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/requested keys|access|unauthor/i.test(message)) {
    return "This wallet is not authorized for the Seal keys on this form. For allowlist forms, the form owner must add the admin wallet to the Seal allowlist before decrypting.";
  }
  return message;
}

function explainGrantAccessError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/rejected|denied|cancel/i.test(message)) return "The wallet rejected the allowlist update transaction.";
  if (/abort|MoveAbort|not.*owner/i.test(message)) return "Only the form owner can update this allowlist.";
  return message;
}

function extractReceiptObjectId(result: SuiTransactionBlockResponse): string | null {
  const createdReceipt = result.objectChanges?.find(
    (change) =>
      change.type === "created" &&
      change.objectType.endsWith("::reputation::SubmissionReceipt") &&
      "objectId" in change,
  );

  if (createdReceipt && "objectId" in createdReceipt && isUsableObjectId(createdReceipt.objectId)) {
    return createdReceipt.objectId;
  }

  const event = result.events?.find((item) => item.type.endsWith("::reputation::ReceiptMinted"));
  const parsed = event?.parsedJson;
  if (parsed && typeof parsed === "object" && "receipt_id" in parsed) {
    const receiptId = eventIdString((parsed as { receipt_id?: unknown }).receipt_id);
    return receiptId && isUsableObjectId(receiptId) ? receiptId : null;
  }

  return null;
}

function eventIdString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === "string" ? id : null;
  }
  return null;
}

function isUsableObjectId(value: string): boolean {
  return isObjectId(value) && !/^0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff$/i.test(value);
}

// ─── Submission metrics panel ──────────────────────────────────────────────

const STATUS_COLORS = [
  "bg-slate-400 dark:bg-slate-500",        // Open
  "bg-indigo-500 dark:bg-indigo-400",      // Triaged
  "bg-violet-500 dark:bg-violet-400",      // In Progress
  "bg-emerald-500 dark:bg-emerald-400",    // Resolved
];

const SEVERITY_COLORS = [
  "bg-green-500",   // Low
  "bg-yellow-400",  // Medium
  "bg-orange-500",  // High
  "bg-red-500",     // Critical
];

function SubmissionMetrics({ rows }: { rows: Row[] }) {
  if (rows.length === 0) return null;

  const total = rows.length;
  const weekAgo = Date.now() - 7 * 86_400_000;
  const weekCount = rows.filter((r) => r.submittedAtMs >= weekAgo).length;
  const openCount = rows.filter((r) => r.status === 0).length;
  const resolvedCount = rows.filter((r) => r.status === 3).length;
  const resolveRate = Math.round((resolvedCount / total) * 100);

  // Status counts
  const statusCounts = STATUS.map((_, i) => rows.filter((r) => r.status === i).length);

  // Activity: daily buckets for last 14 days
  const DAY_MS = 86_400_000;
  const buckets: number[] = Array(14).fill(0);
  const now = Date.now();
  for (const r of rows) {
    const daysAgo = Math.floor((now - r.submittedAtMs) / DAY_MS);
    if (daysAgo >= 0 && daysAgo < 14) buckets[13 - daysAgo]++;
  }
  const maxBucket = Math.max(...buckets, 1);

  // Severity breakdown (only for resolved rows with resolvedSeverity)
  const severityCounts = [0, 1, 2, 3].map(
    (i) => rows.filter((r) => r.status === 3 && r.resolvedSeverity === i).length,
  );
  const hasSeverity = severityCounts.some((c) => c > 0);

  return (
    <div className="mb-5 flex flex-col gap-4">
      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total", value: total, sub: "submissions" },
          { label: "Open", value: openCount, sub: "awaiting review" },
          { label: "Resolved", value: resolvedCount, sub: `${resolveRate}% resolution rate` },
          { label: "This week", value: weekCount, sub: "last 7 days" },
        ].map(({ label, value, sub }) => (
          <div
            key={label}
            className="rounded-xl border border-border/60 bg-background px-4 py-3"
          >
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* ── Status distribution ── */}
        <div className="rounded-xl border border-border/60 bg-background px-4 py-3">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-3">
            Status breakdown
          </p>
          {/* Stacked bar */}
          <div className="flex h-3 rounded-full overflow-hidden gap-px bg-border/30">
            {statusCounts.map((count, i) =>
              count > 0 ? (
                <div
                  key={i}
                  className={cn("transition-all", STATUS_COLORS[i])}
                  style={{ width: `${(count / total) * 100}%` }}
                  title={`${STATUS[i]}: ${count}`}
                />
              ) : null,
            )}
          </div>
          {/* Legend */}
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {STATUS.map((label, i) => (
              <div key={i} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className={cn("h-2 w-2 rounded-full shrink-0", STATUS_COLORS[i])} />
                {label}
                <span className="font-medium text-foreground">{statusCounts[i]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Activity chart ── */}
        <div className="rounded-xl border border-border/60 bg-background px-4 py-3">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-3">
            Activity · last 14 days
          </p>
          <div className="flex items-end gap-px h-12">
            {buckets.map((count, i) => (
              <div
                key={i}
                className="flex-1 flex flex-col justify-end group relative"
                title={`${count} submission${count === 1 ? "" : "s"}`}
              >
                <div
                  className="rounded-sm bg-primary/50 group-hover:bg-primary transition-colors"
                  style={{ height: `${Math.max(count > 0 ? 8 : 2, Math.round((count / maxBucket) * 48))}px` }}
                />
                {/* tooltip */}
                {count > 0 && (
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 hidden group-hover:block bg-foreground text-background text-[10px] rounded px-1 py-0.5 whitespace-nowrap z-10">
                    {count}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[9px] text-muted-foreground/50">
            <span>14d ago</span>
            <span>Today</span>
          </div>
        </div>
      </div>

      {/* ── Severity breakdown (only when resolved rows have severity) ── */}
      {hasSeverity && (
        <div className="rounded-xl border border-border/60 bg-background px-4 py-3">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-3">
            Resolved severity distribution
          </p>
          <div className="flex flex-wrap gap-6">
            {SEVERITY_LABELS.map((label, i) => (
              <div key={i} className="flex items-center gap-2">
                <div
                  className={cn("h-3 rounded-sm", SEVERITY_COLORS[i])}
                  style={{ width: `${Math.max(8, (severityCounts[i] / Math.max(resolvedCount, 1)) * 80)}px` }}
                />
                <span className="text-xs text-muted-foreground">
                  {label} <span className="font-medium text-foreground">{severityCounts[i]}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

