import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Bell, Gift, Globe, Lock, Clock, Coins, Send, ExternalLink, Vote, Eye, Pencil, Sparkles } from "lucide-react";
import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { fromHex } from "@mysten/sui/utils";
import type { SuiTransactionBlockResponse } from "@mysten/sui/jsonRpc";

import { AppShell, PageHeader } from "@/components/layout/AppShell";
import { ConnectGate } from "@/components/ConnectGate";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { FormBuilder } from "@/components/FormBuilder";
import { FormRenderer } from "@/components/FormRenderer";
import { readAllowlists, type SavedAllowlist } from "@/forms/allowlists";
import { deleteLocalForm, readLocalForm, saveLocalForm } from "@/forms/localForms";
import { appendCreateFormGroup } from "@/forms/groups";
import type { FormPolicy } from "@/forms/submit";
import type { FormSchema, WebhookSettings } from "@/forms/types";
import { cloneTemplateSchema } from "@/forms/templates";
import { storeBlob } from "@/walrus/client";
import { estimateStorageCost, formatWal, type StorageCostBreakdown } from "@/walrus/cost";
import { ensureWalSwap, exchangeAvailable } from "@/walrus/exchange";
import { PACKAGE_ID, WALRUS_DEFAULT_EPOCHS, WALRUS_USE_SDK, NETWORK } from "@/config";
import { cn } from "@/lib/utils";

function StorageCostEstimate({ schema, epochs }: { schema: FormSchema; epochs: number }) {
  const [estimate, setEstimate] = useState<StorageCostBreakdown | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Approximate the schema blob size (bytes of the JSON we will upload).
  const schemaBytes = useMemo(() => new TextEncoder().encode(JSON.stringify(schema)).length, [schema]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    // Debounce so dragging the slider doesn't hammer the SDK.
    const handle = window.setTimeout(() => {
      estimateStorageCost(schemaBytes, epochs)
        .then((next) => {
          if (cancelled) return;
          setEstimate(next);
          setLoading(false);
        })
        .catch((err) => {
          if (cancelled) return;
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [schemaBytes, epochs]);

  const days = NETWORK === "mainnet" ? epochs * 14 : epochs;

  return (
    <div className="mt-4 rounded-lg border border-border bg-background-soft px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Estimated storage cost
        </div>
        <div className="text-[10px] text-muted-foreground">
          schema {schemaBytes.toLocaleString()} B · {epochs} epoch{epochs === 1 ? "" : "s"} (~{days}d)
        </div>
      </div>

      {error ? (
        <div className="mt-2 text-xs text-destructive">
          Cost preview unavailable: {error}
        </div>
      ) : loading || !estimate ? (
        <div className="mt-2 grid grid-cols-3 gap-3">
          <div className="skeleton h-4" />
          <div className="skeleton h-4" />
          <div className="skeleton h-4" />
        </div>
      ) : (
        <div className="mt-2 grid grid-cols-3 gap-3 text-xs">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Storage</div>
            <div className="mt-0.5 font-mono">{formatWal(estimate.storageFrost)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Write fee</div>
            <div className="mt-0.5 font-mono">{formatWal(estimate.writeFrost)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-primary">Total</div>
            <div className="mt-0.5 font-mono font-medium">{formatWal(estimate.totalFrost)}</div>
          </div>
        </div>
      )}

      <p className="mt-2 text-[10px] text-muted-foreground leading-relaxed">
        WAL paid by the publisher (default) or by your wallet (SDK mode). Per-submission blobs incur a similar
        cost each; small blobs are dominated by per-blob metadata. SUI gas (register + certify) billed separately.
      </p>
    </div>
  );
}

function PublishConfirmModal({
  open,
  onClose,
  onConfirm,
  isEdit,
  schema,
  policy,
  epochs,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isEdit: boolean;
  schema: FormSchema;
  policy: FormPolicy;
  epochs: number;
}) {
  const [estimate, setEstimate] = useState<StorageCostBreakdown | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);

  const schemaBytes = useMemo(
    () => new TextEncoder().encode(JSON.stringify(schema)).byteLength,
    [schema],
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setEstimating(true);
    setEstimateError(null);
    estimateStorageCost(schemaBytes, epochs)
      .then((next) => {
        if (cancelled) return;
        setEstimate(next);
      })
      .catch((err) => {
        if (cancelled) return;
        setEstimateError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setEstimating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, schemaBytes, epochs]);

  if (!open) return null;

  const days = NETWORK === "mainnet" ? epochs * 14 : epochs;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="liquid-glass-strong rounded-2xl max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-serif italic text-2xl tracking-tight">
          {isEdit ? "Save your changes?" : "Publish this form?"}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          {isEdit
            ? "Your form will be updated. If nothing actually changed, you won't be charged again."
            : "Your form will go live with a shareable link. People can start filling it in right after this."}
        </p>

        <div className="mt-5 rounded-lg border border-border bg-background-soft px-3 py-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="uppercase tracking-widest text-muted-foreground">Form size</span>
            <span className="font-mono">{schemaBytes.toLocaleString()} B</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="uppercase tracking-widest text-muted-foreground">Keep stored for</span>
            <span className="font-mono">{epochs} epoch{epochs === 1 ? "" : "s"} (~{days}d)</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="uppercase tracking-widest text-muted-foreground">Privacy</span>
            <span className="font-mono">{policy.kind}</span>
          </div>
          <div className="border-t border-border/60 pt-2 flex items-center justify-between">
            <span className="text-xs uppercase tracking-widest text-primary">You pay</span>
            {estimating || !estimate ? (
              <span className="skeleton h-4 w-20" />
            ) : (
              <span className="font-mono text-sm font-medium">{formatWal(estimate.totalFrost)}</span>
            )}
          </div>
          {estimateError && (
            <div className="text-xs text-destructive">Could not estimate cost: {estimateError}</div>
          )}
        </div>

        <p className="mt-3 text-[10px] text-muted-foreground leading-relaxed">
          {isEdit
            ? "Plus a tiny network fee. No new form is created — your link stays the same."
            : "Plus a small network fee (under ~0.02 SUI). You'll see this in your wallet popup."}
        </p>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onConfirm} leftIcon={<Send className="h-4 w-4" />}>
            {isEdit ? "Save edits" : "Publish"}
          </Button>
        </div>
      </div>
    </div>
  );
}

const BLANK_SCHEMA: FormSchema = {
  version: 1,
  title: "Untitled form",
  description: "",
  fields: [],
};

const POLICIES: { kind: FormPolicy["kind"]; label: string; description: string; icon: React.ReactNode; tone: "neutral" | "primary" | "secondary" | "tertiary" }[] = [
  { kind: "public", label: "Public", description: "Anyone can see submissions.", icon: <Globe className="h-4 w-4" />, tone: "neutral" },
  { kind: "allowlist", label: "Allowlist", description: "Only listed addresses can decrypt.", icon: <Lock className="h-4 w-4" />, tone: "secondary" },
  { kind: "timelock", label: "Time-locked", description: "Decrypts after a set time.", icon: <Clock className="h-4 w-4" />, tone: "tertiary" },
  { kind: "tokenGated", label: "Token-gated", description: "NFT or token holders only.", icon: <Coins className="h-4 w-4" />, tone: "primary" },
];

export function BuilderPage() {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const navigate = useNavigate();
  const { formId } = useParams();
  const [searchParams] = useSearchParams();
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
  const [schema, setSchema] = useState<FormSchema>(BLANK_SCHEMA);
  const [policy, setPolicy] = useState<FormPolicy>({ kind: "public" });
  const [webhooks, setWebhooks] = useState<WebhookSettings[]>([]);
  const [storageEpochs, setStorageEpochs] = useState<number>(WALRUS_DEFAULT_EPOCHS);
  const [draftId] = useState(() => (formId?.startsWith("draft-") ? formId : createDraftId()));
  const [draftCreatedAtMs, setDraftCreatedAtMs] = useState(() => Date.now());
  const [draftReady, setDraftReady] = useState(false);
  const [viewMode, setViewMode] = useState<"edit" | "preview">("edit");
  const [publishing, setPublishing] = useState(false);
  const [lastDigest, setLastDigest] = useState<string | null>(null);
  const [lastFormId, setLastFormId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Edit mode: a real (non-draft) Sui Form object id in the URL means the user
  // is editing a published form. We load its cached schema + policy and the
  // publish button becomes an in-place `update_form` call instead of creating a
  // new Form.
  const editingPublishedFormId = formId && !formId.startsWith("draft-") ? formId : null;

  useEffect(() => {
    let cancelled = false;
    if (formId && (formId.startsWith("draft-") || editingPublishedFormId)) {
      readLocalForm(formId)
        .then((draft) => {
          if (cancelled) return;
          if (draft) {
            if (draft.schema) setSchema(draft.schema);
            if (draft.policy) setPolicy(draft.policy);
            if (draft.webhooks) setWebhooks(draft.webhooks);
            setDraftCreatedAtMs(draft.createdAtMs);
          }
          setDraftReady(true);
        })
        .catch((err) => {
          // Never block the builder if Supabase / cache fails — surface the error
          // but keep the editor usable with whatever defaults are in state.
          if (cancelled) return;
          console.warn("Draft load failed", err);
          setDraftReady(true);
        });
      return () => {
        cancelled = true;
      };
    }
    // No existing draft: optionally seed from ?template=<id>
    const templateId = searchParams.get("template");
    if (templateId) {
      const seeded = cloneTemplateSchema(templateId);
      if (seeded) setSchema(seeded);
    }
    setDraftReady(true);
  }, [formId]);

  useEffect(() => {
    if (!draftReady) return;
    if (editingPublishedFormId) return; // edit path: don't ghost-save a draft for a published form
    const nextPath = `/builder/${encodeURIComponent(draftId)}`;
    if (!formId) {
      navigate(nextPath, { replace: true });
    }
    if (!hasDraftContent(schema, policy, webhooks)) {
      void deleteLocalForm(draftId);
      return;
    }
    // Debounce auto-save: every keystroke previously fired a Supabase upsert and
    // local write. 600ms is short enough that the user always sees their draft if
    // they navigate away mid-edit.
    const timer = window.setTimeout(() => {
      void saveLocalForm({
        id: draftId,
        title: schema.title.trim() || "Untitled form",
        status: "draft",
        createdAtMs: draftCreatedAtMs,
        updatedAtMs: Date.now(),
        schema,
        policy,
        webhooks,
      });
    }, 600);
    return () => window.clearTimeout(timer);
  }, [draftReady, draftId, draftCreatedAtMs, formId, navigate, policy, schema, webhooks, editingPublishedFormId]);

  async function handlePublish() {
    if (!account) return;
    setError(null);
    setPublishing(true);
    try {
      // Auto-enable wallet id when features that depend on the submitter address
      // are configured. Receipts mint to a wallet; bounty payouts transfer to one.
      const needsWalletId =
        Boolean(schema.reputation?.enabled) ||
        Boolean(schema.bounty?.enabled && schema.bounty?.tiers);
      const publishSchema: FormSchema = {
        ...schema,
        requireWalletId: schema.requireWalletId || needsWalletId,
        integrations: webhooks.length > 0 ? { webhooks } : schema.integrations,
      };
      const schemaBytes = new TextEncoder().encode(JSON.stringify(publishSchema));
      const allowlistMembers =
        policy.kind === "allowlist" ? normalizeWalletList([account.address, ...(policy.members ?? [])]) : [];
      if (policy.kind === "allowlist" && allowlistMembers.length === 0) {
        throw new Error("Add at least one wallet address before publishing an allowlist-gated form.");
      }
      const invalidMembers = allowlistMembers.filter((member) => !isObjectId(member));
      if (invalidMembers.length > 0) {
        throw new Error("One or more allowlist wallet addresses are not valid Sui addresses.");
      }
      if (policy.kind === "tokenGated" && !isObjectId(policy.gateObjectId)) {
        throw new Error("Enter a gate object id before publishing a token-gated form.");
      }

      // SDK upload mode = user pays own Walrus storage in WAL. If the wallet is
      // short, run a SUI→WAL swap as a separate prep tx before kicking off the
      // writeFilesFlow inside storeBlob. Publisher HTTP mode skips this (the
      // publisher pays).
      if (WALRUS_USE_SDK && exchangeAvailable()) {
        try {
          const estimate = await estimateStorageCost(schemaBytes.byteLength, storageEpochs);
          const prepTx = new Transaction();
          const swapped = await ensureWalSwap(client, account.address, estimate.totalFrost, prepTx);
          if (swapped.walCoin) {
            prepTx.transferObjects([swapped.walCoin], prepTx.pure.address(account.address));
            await signAndExecute({ transaction: prepTx });
          }
        } catch (swapErr) {
          // Non-fatal — if swap fails we still try the write; user just gets a
          // wallet-side "insufficient WAL" error if they really were short.
          console.warn("SUI→WAL pre-flight swap skipped", swapErr);
        }
      }

      const { blobId } = await storeBlob(schemaBytes, { epochs: storageEpochs });

      // ── Edit mode ────────────────────────────────────────────────────────
      // If we're editing a published Form, do an in-place update instead of
      // creating a new Form. Saves a Sui object creation; Walrus already
      // deduplicates the schema blob when content is unchanged.
      if (editingPublishedFormId) {
        const updateTx = new Transaction();
        updateTx.moveCall({
          target: `${PACKAGE_ID}::form_registry::update_form`,
          arguments: [
            updateTx.object(editingPublishedFormId),
            updateTx.pure.string(schema.title),
            updateTx.pure.string(blobId),
          ],
        });
        const updateResult = await signAndExecute({ transaction: updateTx });
        setLastDigest(updateResult.digest ?? null);
        setLastFormId(editingPublishedFormId);
        await saveLocalForm({
          id: editingPublishedFormId,
          title: publishSchema.title,
          status: "published",
          createdAtMs: Date.now(),
          updatedAtMs: Date.now(),
          schema: publishSchema,
          policy,
          webhooks,
        });
        navigate(`/admin/${encodeURIComponent(editingPublishedFormId)}`);
        return;
      }

      const tx = new Transaction();
      // Create a sui-groups PermissionedGroup for this form in the same PTB.
      // Owner receives the group object and becomes PermissionsAdmin.
      const groupResult = appendCreateFormGroup(tx);
      tx.transferObjects([groupResult], tx.pure.address(account!.address));

      if (policy.kind === "allowlist") {
        // Single PTB: create the Allowlist as a returned value, add every member
        // to it, then hand it off to `create_form_with_allowlist` which derives
        // the policy object id from the just-created Allowlist and shares both.
        // One wallet popup instead of two.
        const listArg = tx.moveCall({
          target: `${PACKAGE_ID}::seal_policies::new_allowlist`,
          arguments: [],
        });
        for (const member of allowlistMembers) {
          tx.moveCall({
            target: `${PACKAGE_ID}::seal_policies::add_member`,
            arguments: [listArg, tx.pure.address(member)],
          });
        }
        tx.moveCall({
          target: `${PACKAGE_ID}::form_registry::create_form_with_allowlist`,
          arguments: [
            tx.pure.string(schema.title),
            tx.pure.string(blobId),
            listArg,
          ],
        });
      } else {
        const policyObjectId =
          policy.kind === "tokenGated" ? objectIdToBytes(policy.gateObjectId) : [];
        tx.moveCall({
          target: `${PACKAGE_ID}::form_registry::create_form`,
          arguments: [
            tx.pure.string(schema.title),
            tx.pure.string(blobId),
            tx.pure.u8(policy.kind === "timelock" ? 2 : policy.kind === "tokenGated" ? 3 : 0),
            tx.pure.vector("u8", policyObjectId),
            tx.pure.u64(policy.kind === "timelock" ? policy.unlockTimeMs : 0),
          ],
        });
      }

      const result = await signAndExecute({ transaction: tx });
      const formId = extractPublishedFormId(result);
      if (!formId) {
        throw new Error("Published transaction succeeded, but the created Form object id was not returned.");
      }

      // Capture the just-created Allowlist object id so the saved policy is
      // usable for decrypt without round-tripping to the chain.
      let policyToSave: FormPolicy = policy;
      if (policy.kind === "allowlist") {
        const allowlistObjectId =
          extractCreatedObjectId(result, `${PACKAGE_ID}::seal_policies::Allowlist`) ?? "";
        policyToSave = { ...policy, allowlistObjectId };
      }

      // Capture the PermissionedGroup object ID for sui-groups "shared with you" feature.
      const groupObjectId =
        extractCreatedObjectId(
          result,
          `0xba8a26d42bc8b5e5caf4dac2a0f7544128d5dd9b4614af88eec1311ade11de79::permissioned_group::PermissionedGroup`,
        ) ?? undefined;

      setLastDigest(result.digest ?? null);
      setLastFormId(formId);
      await saveLocalForm({
        id: formId,
        title: publishSchema.title,
        status: "published",
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
        submissionCount: 0,
        schema: publishSchema,
        policy: policyToSave,
        webhooks,
        groupObjectId,
      });
      await deleteLocalForm(draftId);
      navigate(`/admin/${encodeURIComponent(formId)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPublishing(false);
    }
  }

  const displaySchema: FormSchema = {
    ...schema,
    integrations: webhooks.length > 0 ? { webhooks } : schema.integrations,
  };

  return (
    <AppShell
      action={
        <div className="flex flex-wrap items-center gap-2">
          {!editingPublishedFormId && (
            <Link to="/dashboard/templates">
              <Button variant="outline" leftIcon={<ArrowLeft className="h-4 w-4" />}>
                Templates
              </Button>
            </Link>
          )}
        </div>
      }
    >
      <PageHeader
        eyebrow="Builder"
        title={editingPublishedFormId ? "Edit form" : "Compose a form"}
        description="Drag fields, pick a Seal policy, ship a shareable link."
      />

      <ConnectGate message="Connect a wallet to publish forms on chain.">
      <div className="max-w-5xl flex flex-col gap-4">

        {/* Edit / Preview tabs */}
        <div className="flex gap-1 border-b border-border/50">
          {(["edit", "preview"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setViewMode(t)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
                viewMode === t
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t === "edit" ? <Pencil className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {t === "edit" ? "Edit" : "Preview"}
            </button>
          ))}
        </div>

        {viewMode === "preview" ? (
          <Card className="liquid-glass-strong rounded-3xl p-0 overflow-hidden max-w-2xl w-full mx-auto">
            <FormRenderer
              schema={displaySchema}
              formId="builder-preview"
              onSubmit={async () => {}}
            />
          </Card>
        ) : (
          <>
          <Card className="p-6">
            <Label>Title</Label>
            <Input
              className="mt-2 text-2xl font-serif italic h-auto py-2 bg-transparent border-0 border-b border-border rounded-none focus:ring-0 focus:border-primary"
              value={schema.title}
              onChange={(e) => setSchema({ ...schema, title: e.target.value })}
              placeholder="Untitled form"
            />
            <Label className="mt-5 block">Description</Label>
            <Textarea
              className="mt-2 bg-transparent"
              value={schema.description ?? ""}
              onChange={(e) => setSchema({ ...schema, description: e.target.value })}
              placeholder="What is this form for?"
            />
          </Card>

          <FormBuilder initial={schema} onSchemaChange={setSchema} />

          <Card className="p-6">
            <div className="flex items-end justify-between gap-4 mb-4">
              <div>
                <Label>Encryption policy</Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Public is plaintext. Seal policies encrypt submissions until a Move check passes.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {POLICIES.map((p) => {
                const active = policy.kind === p.kind;
                return (
                  <button
                    key={p.kind}
                    type="button"
                    onClick={() => {
                      if (p.kind === "public") setPolicy({ kind: "public" });
                      else if (p.kind === "allowlist") setPolicy({ kind: "allowlist", allowlistObjectId: "", members: [] });
                      else if (p.kind === "timelock") setPolicy({ kind: "timelock", unlockTimeMs: BigInt(Date.now() + 86400000) });
                      else setPolicy({ kind: "tokenGated", gateObjectId: "" });
                    }}
                    className={cn(
                      "text-left rounded-xl border p-4 transition-all",
                      active
                        ? "border-primary bg-primary/8 ring-2 ring-primary/30"
                        : "border-border bg-background-soft hover:border-primary/30",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-foreground">{p.icon}</div>
                    </div>
                    <div className="mt-3 font-medium text-sm">{p.label}</div>
                    <div className="mt-1 text-xs text-muted-foreground leading-relaxed">{p.description}</div>
                  </button>
                );
              })}
            </div>
            <PolicyDetails policy={policy} setPolicy={setPolicy} />
          </Card>

          <Card className="p-5">
            <div className="flex items-end justify-between gap-4 mb-3">
              <div>
                <Label>Walrus storage duration</Label>
                <p className="mt-1 text-xs text-muted-foreground max-w-md">
                  How many Walrus epochs to reserve for the form schema + every submission
                  blob. {storageEpochs === 53 ? "53 = max (~2 years on mainnet / ~53 days on testnet)." : "Max 53. Testnet 1 epoch ≈ 1 day; mainnet 1 epoch ≈ 14 days."}
                </p>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Default</div>
                <div className="font-mono text-xs">{WALRUS_DEFAULT_EPOCHS} epochs</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min={1}
                max={53}
                value={storageEpochs}
                onChange={(e) =>
                  setStorageEpochs(Math.max(1, Math.min(53, Number(e.target.value) || WALRUS_DEFAULT_EPOCHS)))
                }
                className="w-28"
              />
              <input
                type="range"
                min={1}
                max={53}
                value={storageEpochs}
                onChange={(e) => setStorageEpochs(Number(e.target.value))}
                className="flex-1 accent-primary"
                aria-label="Walrus storage epochs"
              />
              <button
                type="button"
                onClick={() => setStorageEpochs(53)}
                className="text-xs text-primary hover:underline"
              >
                max
              </button>
            </div>
            <StorageCostEstimate schema={schema} epochs={storageEpochs} />
          </Card>

          <RoadmapSettings
            schema={schema}
            setSchema={setSchema}
            webhooks={webhooks}
            setWebhooks={setWebhooks}
          />
          {account ? (
            <Button
              className="w-full"
              onClick={() => setConfirmOpen(true)}
              disabled={publishing}
              leftIcon={<Send className="h-4 w-4" />}
            >
              {publishing
                ? editingPublishedFormId
                  ? "Saving…"
                  : "Publishing…"
                : editingPublishedFormId
                ? "Save edits"
                : "Publish"}
            </Button>
          ) : null}
          </>
        )}

          {error && (
            <Card className="p-4 border-destructive/40 bg-destructive/10">
              <Label className="text-destructive">Publish failed</Label>
              <p className="mt-1 text-xs text-destructive/90 break-words">{error}</p>
            </Card>
          )}

          <PublishConfirmModal
            open={confirmOpen}
            onClose={() => setConfirmOpen(false)}
            onConfirm={async () => {
              setConfirmOpen(false);
              await handlePublish();
            }}
            isEdit={Boolean(editingPublishedFormId)}
            schema={schema}
            policy={policy}
            epochs={storageEpochs}
          />

          {lastDigest && (
            <Card className="p-4">
              <Label>Published</Label>
              {lastFormId && (
                <div className="mt-2 font-mono text-xs text-foreground break-all">
                  form: {lastFormId}
                </div>
              )}
              <div className="mt-2 font-mono text-xs text-muted-foreground break-all">
                tx: {lastDigest}
              </div>
              <Button
                size="sm"
                variant="outline"
                leftIcon={<ExternalLink className="h-3.5 w-3.5" />}
                className="mt-3"
                onClick={() =>
                  window.open(`https://suiscan.xyz/${NETWORK}/tx/${lastDigest}`, "_blank")
                }
              >
                View on Suiscan
              </Button>
            </Card>
          )}
      </div>
      </ConnectGate>
    </AppShell>
  );
}

function objectIdToBytes(id: string): number[] {
  if (!/^0x[0-9a-fA-F]{64}$/.test(id)) return [];
  return Array.from(fromHex(id));
}

function createDraftId(): string {
  return `draft-${crypto.randomUUID()}`;
}

function hasDraftContent(schema: FormSchema, policy: FormPolicy, webhooks: WebhookSettings[]): boolean {
  if (schema.title.trim() && schema.title.trim() !== BLANK_SCHEMA.title) return true;
  if (schema.description?.trim()) return true;
  if (schema.fields.length > 0) return true;
  if (schema.templateId) return true;
  if (schema.bounty?.enabled || schema.featureVoting?.enabled || schema.reputation?.enabled) return true;
  if (webhooks.some((hook) => hook.target.trim() || hook.kind !== "slack" || hook.enabled)) return true;
  if (policy.kind !== "public") return true;
  return false;
}

function isObjectId(value: string | undefined): value is string {
  return Boolean(value && /^0x[0-9a-fA-F]{64}$/.test(value));
}

function parseWalletList(value: string): string[] {
  return normalizeWalletList(value.split(/[\s,]+/));
}

function normalizeWalletList(members: string[]): string[] {
  return [...new Set(members.map((member) => member.trim()).filter(Boolean))];
}

function shortObjectId(value: string): string {
  return value.length > 14 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
}

function extractPublishedFormId(result: SuiTransactionBlockResponse): string | null {
  const createdFormId = extractCreatedObjectId(result, `${PACKAGE_ID}::form_registry::Form`);
  if (createdFormId) return createdFormId;

  const createdEvent = result.events?.find((event) =>
    event.type.endsWith("::form_registry::FormCreated"),
  );
  const parsed = createdEvent?.parsedJson;
  if (parsed && typeof parsed === "object" && "form_id" in parsed) {
    const formId = (parsed as { form_id?: unknown }).form_id;
    return typeof formId === "string" ? formId : null;
  }

  return null;
}

function extractCreatedObjectId(result: SuiTransactionBlockResponse, objectType: string): string | null {
  const created = result.objectChanges?.find(
    (change) => change.type === "created" && change.objectType === objectType && "objectId" in change,
  );
  return created && "objectId" in created ? created.objectId : null;
}

type MemberEntry = { address: string; role: "admin" | "reviewer" };

function memberEntries(policy: FormPolicy): MemberEntry[] {
  if (policy.kind !== "allowlist") return [];
  return (policy.members ?? []).map((addr) => ({
    address: addr,
    role: (policy.memberRoles?.[addr] ?? "admin") as "admin" | "reviewer",
  }));
}

function PolicyDetails({ policy, setPolicy }: { policy: FormPolicy; setPolicy: (p: FormPolicy) => void }) {
  const [savedAllowlists, setSavedAllowlists] = useState<SavedAllowlist[]>([]);
  const [draftMembers, setDraftMembers] = useState("");

  useEffect(() => {
    let cancelled = false;
    readAllowlists().then((lists) => {
      if (!cancelled) setSavedAllowlists(lists);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (policy.kind === "public") return null;
  return (
    <div className="mt-5 grid gap-3">
      {policy.kind === "allowlist" && (
        <div className="grid gap-4">
          <div className="rounded-lg border border-border bg-background-soft p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <Label>Who can decrypt submissions?</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Add the wallet addresses for this form. Saved lists are optional shortcuts.
                </p>
              </div>
              <Badge tone={policy.members?.length ? "primary" : "neutral"}>
                {policy.members?.length ?? 0} wallet{policy.members?.length === 1 ? "" : "s"}
              </Badge>
            </div>

            {/* Per-address row editor */}
            <div className="mt-3 space-y-2">
              {memberEntries(policy).map((entry, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    className="flex-1 h-8 rounded-lg border border-border bg-background px-3 font-mono text-xs placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/40"
                    placeholder="0x… wallet address"
                    value={entry.address}
                    onChange={(e) => {
                      if (policy.kind !== "allowlist") return;
                      const entries = memberEntries(policy);
                      entries[i] = { ...entries[i], address: e.target.value };
                      const members = entries.map((en) => en.address).filter(Boolean);
                      const memberRoles = Object.fromEntries(entries.filter((en) => en.address).map((en) => [en.address, en.role]));
                      setPolicy({ ...policy, members, memberRoles, allowlistObjectId: "" });
                    }}
                  />
                  <select
                    className="h-8 rounded-lg border border-border bg-background px-2 text-xs shrink-0"
                    value={entry.role}
                    onChange={(e) => {
                      if (policy.kind !== "allowlist") return;
                      const entries = memberEntries(policy);
                      entries[i] = { ...entries[i], role: e.target.value as "admin" | "reviewer" };
                      const memberRoles = Object.fromEntries(entries.filter((en) => en.address).map((en) => [en.address, en.role]));
                      setPolicy({ ...policy, memberRoles, allowlistObjectId: "" });
                    }}
                  >
                    <option value="admin">Admin</option>
                    <option value="reviewer">Reviewer</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      if (policy.kind !== "allowlist") return;
                      const entries = memberEntries(policy).filter((_, j) => j !== i);
                      const members = entries.map((en) => en.address).filter(Boolean);
                      const memberRoles = Object.fromEntries(entries.filter((en) => en.address).map((en) => [en.address, en.role]));
                      setPolicy({ ...policy, members, memberRoles, allowlistObjectId: "" });
                    }}
                    className="p-1 rounded text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => {
                  if (policy.kind !== "allowlist") return;
                  const entries = [...memberEntries(policy), { address: "", role: "admin" as const }];
                  setPolicy({ ...policy, allowlistObjectId: "" });
                  const members = entries.map((en) => en.address).filter(Boolean);
                  const memberRoles = Object.fromEntries(entries.filter((en) => en.address).map((en) => [en.address, en.role]));
                  setPolicy({ ...policy, members, memberRoles, allowlistObjectId: "" });
                }}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors mt-1"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                Add address
              </button>
            </div>

            {/* Import from saved list */}
            {savedAllowlists.filter((l) => l.members.length > 0 && l.name.trim() && l.name.trim().toLowerCase() !== "untitled allowlist").length > 0 && (
              <div className="mt-3 flex gap-2">
                <select
                  className="h-8 flex-1 rounded-lg border border-border bg-background px-3 text-xs"
                  value=""
                  onChange={(e) => {
                    const selected = savedAllowlists.find((list) => list.id === e.target.value);
                    if (!selected || policy.kind !== "allowlist") return;
                    const existing = memberEntries(policy);
                    const existingAddrs = new Set(existing.map((en) => en.address));
                    const toAdd: MemberEntry[] = selected.members
                      .filter((m) => !existingAddrs.has(m))
                      .map((m) => ({ address: m, role: "admin" as const }));
                    const entries = [...existing, ...toAdd];
                    const members = entries.map((en) => en.address).filter(Boolean);
                    const memberRoles = Object.fromEntries(entries.filter((en) => en.address).map((en) => [en.address, en.role]));
                    setPolicy({ ...policy, allowlistId: selected.id, allowlistName: selected.name, members, memberRoles, allowlistObjectId: "" });
                  }}
                >
                  <option value="">Import from saved list…</option>
                  {savedAllowlists
                    .filter((l) => l.members.length > 0 && l.name.trim() && l.name.trim().toLowerCase() !== "untitled allowlist")
                    .map((list) => (
                      <option key={list.id} value={list.id}>{list.name} ({list.members.length})</option>
                    ))}
                </select>
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Publishing will create the on-chain Seal policy automatically.
          </p>
        </div>
      )}
      {policy.kind === "tokenGated" && (
        <div>
          <Label>Gate object id</Label>
          <Input
            className="mt-1.5 font-mono text-xs"
            value={policy.gateObjectId}
            onChange={(e) => setPolicy({ kind: "tokenGated", gateObjectId: e.target.value })}
            placeholder="0x…"
          />
        </div>
      )}
      {policy.kind === "timelock" && (
        <div>
          <Label>Unlock time</Label>
          <Input
            type="datetime-local"
            className="mt-1.5"
            value={new Date(Number(policy.unlockTimeMs)).toISOString().slice(0, 16)}
            onChange={(e) =>
              setPolicy({ kind: "timelock", unlockTimeMs: BigInt(new Date(e.target.value).getTime()) })
            }
          />
        </div>
      )}
    </div>
  );
}

function RoadmapSettings({
  schema,
  setSchema,
  webhooks,
  setWebhooks,
}: {
  schema: FormSchema;
  setSchema: (schema: FormSchema) => void;
  webhooks: WebhookSettings[];
  setWebhooks: (webhooks: WebhookSettings[]) => void;
}) {
  const defaultTiers: [string, string, string, string] = ["0", "0", "0", "0"];
  const bounty = schema.bounty ?? {
    enabled: false,
    tokenSymbol: "WAL" as const,
    payoutAmount: "0",
    tiers: defaultTiers,
  };
  const tiers: [string, string, string, string] =
    bounty.tiers ??
    (bounty.payoutAmount
      ? ["0", bounty.payoutAmount, bounty.payoutAmount, bounty.payoutAmount]
      : defaultTiers);
  const voting = schema.featureVoting ?? { enabled: false, quadratic: true };
  const reputation = schema.reputation ?? { enabled: false };

  function patchBounty(patch: Partial<typeof bounty>) {
    setSchema({ ...schema, bounty: { ...bounty, ...patch } });
  }

  function patchVoting(patch: Partial<typeof voting>) {
    setSchema({ ...schema, featureVoting: { ...voting, ...patch } });
  }

  function patchReputation(patch: Partial<typeof reputation>) {
    setSchema({ ...schema, reputation: { ...reputation, ...patch } });
  }

  function updateWebhook(index: number, patch: Partial<WebhookSettings>) {
    setWebhooks(webhooks.map((hook, i) => (i === index ? { ...hook, ...patch } : hook)));
  }

  return (
    <Card className="p-6">
      <div className="grid gap-0 divide-y divide-border/50">

        {/* Sponsored bounty */}
        <div className="py-5 first:pt-0 last:pb-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 h-8 w-8 rounded-lg bg-secondary/10 flex items-center justify-center shrink-0">
                <Gift className="h-4 w-4 text-secondary-strong dark:text-secondary" />
              </div>
              <div>
                <p className="text-sm font-medium">Sponsored bounty</p>
                <p className="text-xs text-muted-foreground mt-0.5">Severity-tiered payouts from your wallet at resolve time</p>
              </div>
            </div>
            <ToggleSwitch checked={bounty.enabled} onChange={(v) => patchBounty({ enabled: v })} />
          </div>
          {bounty.enabled && (
            <div className="mt-4 ml-11 space-y-3">
              <div className="flex items-center gap-2">
                <p className="text-xs text-muted-foreground">Token</p>
                <select
                  className="h-7 rounded-lg bg-background-soft border border-border px-2 text-xs"
                  value={bounty.tokenSymbol}
                  onChange={(e) => patchBounty({ tokenSymbol: e.target.value as "WAL" | "SUI" })}
                >
                  <option value="WAL">WAL</option>
                  <option value="SUI">SUI</option>
                </select>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(["Low", "Medium", "High", "Critical"] as const).map((label, i) => (
                  <div key={label}>
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
                    <Input
                      value={tiers[i]}
                      onChange={(e) => {
                        const next: [string, string, string, string] = [...tiers] as [string, string, string, string];
                        next[i] = e.target.value;
                        patchBounty({ tiers: next });
                      }}
                      placeholder="0"
                    />
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">Funds debit from your wallet at resolve time. Keep enough balance for the chosen tier.</p>
            </div>
          )}
        </div>

        {/* Submission identity */}
        <div className="py-5 first:pt-0 last:pb-0">
          <div className="flex items-start gap-3 mb-3">
            <div className="mt-0.5 h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Lock className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">Submission identity</p>
              <p className="text-xs text-muted-foreground mt-0.5">Controls the wallet address field shown to submitters</p>
            </div>
          </div>
          <div className="ml-11 grid grid-cols-3 gap-2">
            {([
              { value: undefined, label: "Anonymous", sub: "No wallet required" },
              { value: false, label: "Optional", sub: "Wallet can be recorded" },
              { value: true, label: "Required", sub: "Wallet must sign" },
            ] as { value: boolean | undefined; label: string; sub: string }[]).map((opt) => {
              const active = opt.value === undefined ? schema.requireWalletId === undefined : schema.requireWalletId === opt.value;
              return (
                <button
                  key={String(opt.value)}
                  type="button"
                  onClick={() => setSchema({ ...schema, requireWalletId: opt.value })}
                  className={cn(
                    "text-left rounded-xl border p-3 transition-all",
                    active ? "border-primary bg-primary/8 ring-2 ring-primary/30" : "border-border bg-background-soft hover:border-primary/30",
                  )}
                >
                  <p className="text-sm font-medium">{opt.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{opt.sub}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Submitter reputation */}
        <div className="py-5 first:pt-0 last:pb-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 h-8 w-8 rounded-lg bg-secondary/10 flex items-center justify-center shrink-0">
                <Sparkles className="h-4 w-4 text-secondary-strong dark:text-secondary" />
              </div>
              <div>
                <p className="text-sm font-medium">Submitter reputation</p>
                <p className="text-xs text-muted-foreground mt-0.5">Create on-chain reputation records for submissions</p>
              </div>
            </div>
            <ToggleSwitch checked={reputation.enabled} onChange={(v) => patchReputation({ enabled: v })} />
          </div>
          {reputation.enabled && (
            <p className="mt-3 ml-11 text-xs text-muted-foreground">
              Each submitter signs creation of their own reputation record during submission. Resolved reports can update that record from the admin view.
            </p>
          )}
        </div>

        {/* Feature request voting */}
        <div className="py-5 first:pt-0 last:pb-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 h-8 w-8 rounded-lg bg-tertiary/10 flex items-center justify-center shrink-0">
                <Vote className="h-4 w-4 text-tertiary-strong dark:text-tertiary" />
              </div>
              <div>
                <p className="text-sm font-medium">Feature request voting</p>
                <p className="text-xs text-muted-foreground mt-0.5">Let submitters vote on each other's entries</p>
              </div>
            </div>
            <ToggleSwitch checked={voting.enabled} onChange={(v) => patchVoting({ enabled: v })} />
          </div>
          {voting.enabled && (
            <div className="mt-3 ml-11 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <ToggleSwitch checked={voting.quadratic} onChange={(v) => patchVoting({ quadratic: v })} size="sm" />
                <span className="text-sm">Quadratic credits</span>
              </label>
              <p className="text-xs text-muted-foreground">Voting board can be created after the form has a published on-chain id.</p>
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" />
              <Label>Webhook forwarder</Label>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                setWebhooks([
                  ...webhooks,
                  { id: crypto.randomUUID(), kind: "slack", target: "", enabled: true },
                ])
              }
            >
              Add webhook
            </Button>
          </div>
          <div className="mt-3 grid gap-2">
            {webhooks.length === 0 && (
              <div className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
                Slack, Discord, and Linear targets can be attached at publish time.
              </div>
            )}
            {webhooks.map((hook, index) => (
              <div key={hook.id} className="grid grid-cols-1 sm:grid-cols-[120px_1fr_auto] gap-2">
                <select
                  className="h-10 rounded-lg bg-background-soft border border-border px-3 text-sm"
                  value={hook.kind}
                  onChange={(e) => updateWebhook(index, { kind: e.target.value as WebhookSettings["kind"] })}
                >
                  <option value="slack">Slack</option>
                  <option value="discord">Discord</option>
                  <option value="linear">Linear</option>
                </select>
                <Input
                  value={hook.target}
                  onChange={(e) => updateWebhook(index, { target: e.target.value })}
                  placeholder="Webhook URL or Linear team key"
                />
                <label className="inline-flex items-center gap-2 text-sm justify-self-start sm:justify-self-end">
                  <input
                    type="checkbox"
                    className="accent-primary"
                    checked={hook.enabled}
                    onChange={(e) => updateWebhook(index, { enabled: e.target.checked })}
                  />
                  Enabled
                </label>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  size = "md",
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  size?: "sm" | "md";
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
        size === "sm" ? "h-4 w-7" : "h-5 w-9",
        checked ? "bg-primary" : "bg-border",
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block rounded-full bg-white shadow transition-transform duration-200",
          size === "sm" ? "h-3 w-3" : "h-4 w-4",
          checked
            ? size === "sm" ? "translate-x-3" : "translate-x-4"
            : "translate-x-0",
        )}
      />
    </button>
  );
}
