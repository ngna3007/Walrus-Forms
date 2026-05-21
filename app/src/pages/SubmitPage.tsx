import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertCircle, Lock, ShieldCheck, Zap } from "lucide-react";
import {
  ConnectButton,
  useCurrentAccount,
  useDisconnectWallet,
  useSignAndExecuteTransaction,
  useSignTransaction,
  useSuiClient,
  useSuiClientQuery,
} from "@mysten/dapp-kit";
import type { SuiTransactionBlockResponse } from "@mysten/sui/jsonRpc";
import type { Transaction } from "@mysten/sui/transactions";
import { toHex } from "@mysten/sui/utils";

import { Logo } from "@/components/Logo";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FormRenderer, type PendingFileUpload } from "@/components/FormRenderer";
import { buildSubmissionTx, type FormPolicy } from "@/forms/submit";
import { saveSubmission } from "@/forms/submissions";
import { bumpFormSubmissionCount } from "@/forms/localForms";
import { addSubscription } from "@/forms/subscriptions";
import type { FormSchema, SubmissionPayload } from "@/forms/types";
import { readJson } from "@/walrus/client";
import { applyTheme, getStoredTheme } from "@/lib/theme";
import { ENOKI_SPONSORED_SUBMISSIONS, ENOKI_SPONSOR_CONFIGURED, PACKAGE_ID } from "@/config";
import {
  createSponsoredSubmissionTransaction,
  executeSponsoredSubmissionTransaction,
} from "@/enoki/sponsor";

const POLICY_LABELS: Record<FormPolicy["kind"], string> = {
  public: "Public",
  allowlist: "Allowlist",
  timelock: "Time-locked",
  tokenGated: "Token-gated",
};

function cryptoRandomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

function isRealObjectId(id: string | undefined): boolean {
  return Boolean(id && /^0x[0-9a-fA-F]{64}$/.test(id));
}

function getPolicyObjectId(policy: FormPolicy): string | undefined {
  if (policy.kind === "allowlist") return policy.allowlistObjectId;
  if (policy.kind === "tokenGated") return policy.gateObjectId;
  return undefined;
}

export function SubmitPage() {
  const { formId } = useParams<{ formId: string }>();
  const account = useCurrentAccount();
  const { mutate: disconnect } = useDisconnectWallet();
  const client = useSuiClient();
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
  const { mutateAsync: signTransaction } = useSignTransaction();
  const [schema, setSchema] = useState<FormSchema | null>(null);
  const [schemaError, setSchemaError] = useState<string | null>(null);

  useEffect(() => {
    applyTheme(getStoredTheme());
  }, []);

  const isReal = isRealObjectId(formId);

  const { data: formObject, error: queryError } = useSuiClientQuery(
    "getObject",
    {
      id: formId ?? "",
      options: { showContent: true, showOwner: true },
    },
    { enabled: isReal },
  );

  const formMeta = useMemo(() => {
    const content = formObject?.data?.content;
    if (!content || content.dataType !== "moveObject") return null;
    const fields = content.fields as Record<string, unknown>;
    return {
      title: String(fields.title ?? ""),
      schemaBlobId: String(fields.schema_blob_id ?? ""),
      owner: String(fields.owner ?? ""),
      policy_type: Number(fields.policy_type ?? 0),
      policy_object_id: (fields.policy_object_id ?? []) as number[],
      unlock_time_ms: BigInt(String(fields.unlock_time_ms ?? "0")),
      open: Boolean(fields.open),
    };
  }, [formObject]);

  const policy: FormPolicy = useMemo(() => {
    if (!formMeta) return { kind: "public" };
    switch (formMeta.policy_type) {
      case 1:
        return {
          kind: "allowlist",
          allowlistObjectId: "0x" + toHex(Uint8Array.from(formMeta.policy_object_id)),
        };
      case 2:
        return { kind: "timelock", unlockTimeMs: formMeta.unlock_time_ms };
      case 3:
        return {
          kind: "tokenGated",
          gateObjectId: "0x" + toHex(Uint8Array.from(formMeta.policy_object_id)),
        };
      default:
        return { kind: "public" };
    }
  }, [formMeta]);

  // Auto-subscribe: when a wallet visits a public form link, add it to that
  // wallet's local dashboard so they can find it again later. The form owner is
  // skipped — they already see it under owned forms.
  useEffect(() => {
    if (!formId || !formMeta || !account?.address) return;
    void addSubscription(
      {
        id: formId,
        title: schema?.title || formMeta.title || "Untitled form",
        ownerAddress: formMeta.owner,
        policyKind: policy.kind,
        addedAtMs: Date.now(),
      },
      account.address,
    );
  }, [account?.address, formId, formMeta?.owner, formMeta?.title, policy.kind, schema?.title]);

  useEffect(() => {
    if (!formMeta?.schemaBlobId) return;
    let cancelled = false;
    (async () => {
      try {
        const json = await readJson<FormSchema>(formMeta.schemaBlobId);
        if (!cancelled) setSchema(json);
      } catch (err) {
        if (!cancelled) setSchemaError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [formMeta?.schemaBlobId]);

  async function handleSubmit(payload: SubmissionPayload, pendingFiles: PendingFileUpload[]) {
    if (!schema || !formId) throw new Error("Form not loaded");
    if (!account?.address) throw new Error("Connect a wallet to submit this form.");
    const requireWalletId = Boolean(schema.requireWalletId);
    const anonymousId = `anon:${cryptoRandomHex(8)}`;
    const submitterForPayload = requireWalletId ? account.address : anonymousId;
    const submissionPayload: SubmissionPayload = { ...payload, submitter: submitterForPayload };

    // Convert File objects to Uint8Array buffers for the submission quilt.
    const fileBuffers = await Promise.all(
      pendingFiles.map(async (pf) => ({
        contents: new Uint8Array(await pf.file.arrayBuffer()),
        mimeType: pf.mimeType,
        fieldKey: pf.fieldKey,
      })),
    );

    const { submissionBlobId, fileBlobIds, txBuilder, certifyTxResult } = await buildSubmissionTx({
      formId,
      formObjectId: formId,
      policy,
      schema,
      payload: submissionPayload,
      pendingFiles: fileBuffers,
      createReputation: Boolean(schema.reputation?.enabled),
      signAndExecute,
      owner: account.address,
    });

    let result: SuiTransactionBlockResponse;
    if (!txBuilder) {
      // SDK/quilt mode: certify+submit already executed inside buildSubmissionTx.
      result = certifyTxResult as SuiTransactionBlockResponse;
    } else if (ENOKI_SPONSORED_SUBMISSIONS && ENOKI_SPONSOR_CONFIGURED) {
      // Only attempt the sponsored path when both toggles are on AND the sponsor URL
      // is wired up; otherwise the helper throws synchronously and we double-sign.
      try {
        result = await executeSponsoredSubmit({
          transaction: txBuilder,
          sender: account.address,
          formId,
          policy,
          createReputation: Boolean(schema.reputation?.enabled),
        });
      } catch (sponsorError) {
        console.warn("Enoki sponsor unavailable, falling back to wallet-signed submission.", sponsorError);
        result = await signAndExecute({ transaction: txBuilder });
      }
    } else {
      result = await signAndExecute({ transaction: txBuilder });
    }
    const txDigest = typeof result.digest === "string" ? result.digest : undefined;
    const submissionObjectId = extractSubmissionObjectId(result);
    const reputationObjectId: string | null = null;
    const now = Date.now();
    await saveSubmission(
      {
        id: submissionObjectId ?? (txDigest ? `${formId}:${txDigest}` : `${formId}:${submissionBlobId}:${now}`),
        formId,
        submitter: submitterForPayload,
        status: 0,
        submittedAtMs: submissionPayload.submittedAt,
        updatedAtMs: now,
        walrusBlobId: submissionBlobId,
        suiSubmissionObjectId: submissionObjectId ?? undefined,
        reputationObjectId: schema.reputation?.enabled ? reputationObjectId ?? undefined : undefined,
        txDigest,
        encrypted: policy.kind !== "public",
        decrypted: policy.kind === "public",
        payload: policy.kind === "public" ? submissionPayload : undefined,
        fileBlobIds,
      },
      formMeta?.owner,
    );
    void bumpFormSubmissionCount(formId);
  }

  async function executeSponsoredSubmit({
    transaction,
    sender,
    formId,
    policy,
    createReputation,
  }: {
    transaction: Transaction;
    sender: string;
    formId: string;
    policy: FormPolicy;
    createReputation: boolean;
  }) {
    const allowedMoveCallTargets = [`${PACKAGE_ID}::submission::submit`];
    // Reputation receipts now mint at resolve time (form owner), not at submit.
    void createReputation;

    const allowedAddresses = [sender, formId, PACKAGE_ID, "0x6", getPolicyObjectId(policy)].filter(
      (value): value is string => Boolean(value && value !== "0x0"),
    );

    const sponsored = await createSponsoredSubmissionTransaction({
      transaction,
      client,
      sender,
      allowlist: { allowedMoveCallTargets, allowedAddresses },
    });
    const { signature } = await signTransaction({ transaction: sponsored.bytes });
    if (!signature) throw new Error("Wallet did not return a transaction signature.");

    return executeSponsoredSubmissionTransaction({
      digest: sponsored.digest,
      signature,
    });
  }

  const error = !isReal ? "This public form link is not a valid published Sui Form object id." : queryError?.message ?? schemaError;
  const isSeal = policy.kind !== "public";
  const sponsorEnabled = ENOKI_SPONSORED_SUBMISSIONS && ENOKI_SPONSOR_CONFIGURED;

  return (
    <div className="min-h-svh hero-gradient-bg grain text-foreground">
      <header className="px-6 py-4 flex items-center justify-between max-w-3xl mx-auto">
        <Link to="/" aria-label="Go to home" className="inline-flex items-center transition-opacity hover:opacity-80">
          <Logo />
        </Link>
        <div className="flex items-center gap-2">
          <Badge tone={isSeal ? "tertiary" : "neutral"} icon={<Lock className="h-3 w-3" />}>
            {POLICY_LABELS[policy.kind]}
          </Badge>
          {sponsorEnabled && (
            <Badge tone="secondary" icon={<Zap className="h-3 w-3" />}>
              Sponsored gas
            </Badge>
          )}
        </div>
      </header>

      <main className="px-4 sm:px-6 pb-16">
        <div className="max-w-2xl mx-auto">
          <Card className="liquid-glass-strong rounded-3xl overflow-hidden p-0">
            {/* Cover banner */}
            <div className="relative h-40 w-full overflow-hidden bg-gradient-to-br from-violet-600 via-purple-600 to-cyan-500">
              <img
                src="/walrus-builder.png"
                alt=""
                aria-hidden="true"
                className="absolute inset-0 w-full h-full object-cover object-top mix-blend-luminosity opacity-60 pointer-events-none select-none"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
              <div className="absolute bottom-4 left-5 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-white/80" />
                <span className="text-xs uppercase tracking-widest text-white/70">
                  Form {formId ? `#${formId.slice(0, 10)}` : ""}
                </span>
              </div>
            </div>

            <div className="p-8 sm:p-10">

            {error && (
              <div className="mb-6 flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {!schema && !error && (
              <div className="space-y-3">
                <div className="skeleton h-8 w-2/3" />
                <div className="skeleton h-4 w-full" />
                <div className="skeleton h-32 w-full" />
                <div className="skeleton h-10 w-32" />
              </div>
            )}

            {schema && formMeta?.open === false && (
              <div className="rounded-lg bg-muted px-3 py-3 text-sm text-muted-foreground">
                This form is closed and no longer accepting submissions.
              </div>
            )}

            {schema && formMeta?.open !== false && (
              <FormRenderer
                schema={schema}
                formId={formId ?? ""}
                submitter={account?.address}
                connectPrompt={!account?.address ? <ConnectButton /> : undefined}
                onDisconnect={account?.address ? () => disconnect() : undefined}
                footerNote={sponsorEnabled ? "Submit transaction is sponsored using Enoki" : undefined}
                onSubmit={handleSubmit}
              />
            )}
            </div>{/* /inner padding */}
          </Card>
        </div>
      </main>
    </div>
  );
}

function extractSubmissionObjectId(result: SuiTransactionBlockResponse): string | null {
  const createdSubmission = extractCreatedObjectId(result, "::submission::Submission");
  if (createdSubmission) return createdSubmission;

  const event = result.events?.find((item) => item.type.endsWith("::submission::SubmissionCreated"));
  const parsed = event?.parsedJson;
  if (parsed && typeof parsed === "object" && "submission_id" in parsed) {
    const submissionId = (parsed as { submission_id?: unknown }).submission_id;
    if (typeof submissionId === "string") return submissionId;
  }

  return null;
}

function extractCreatedObjectId(result: SuiTransactionBlockResponse, objectTypeSuffix: string): string | null {
  const created = result.objectChanges?.find(
    (change) =>
      change.type === "created" &&
      change.objectType.endsWith(objectTypeSuffix) &&
      "objectId" in change,
  );
  return created && "objectId" in created ? created.objectId : null;
}
