import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Lock, ShieldCheck, AlertCircle } from "lucide-react";
import { useSignAndExecuteTransaction, useSuiClientQuery } from "@mysten/dapp-kit";
import { fromHex, toHex } from "@mysten/sui/utils";

import { Logo } from "@/components/Logo";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FormRenderer } from "@/components/FormRenderer";
import { buildSubmissionTx, type FormPolicy } from "@/forms/submit";
import type { FormSchema, SubmissionPayload } from "@/forms/types";
import { readJson } from "@/walrus/client";
import { applyTheme, getStoredTheme } from "@/lib/theme";

const POLICY_LABELS: Record<FormPolicy["kind"], string> = {
  public: "Public",
  allowlist: "Allowlist · Seal-encrypted",
  timelock: "Time-locked · Seal-encrypted",
  tokenGated: "Token-gated · Seal-encrypted",
};

const DEMO_SCHEMA: FormSchema = {
  version: 1,
  title: "Walrus Forms — sample",
  description: "Demo form. Markdown supported in rich-text fields.",
  fields: [
    { id: "name", type: "shortText", label: "Name", required: false },
    { id: "feedback", type: "longText", label: "What's on your mind?", required: true },
    { id: "rating", type: "stars", label: "Overall rating", required: false, max: 5 },
  ],
};

function isRealObjectId(id: string | undefined): boolean {
  return Boolean(id && /^0x[0-9a-fA-F]{64}$/.test(id));
}

export function SubmitPage() {
  const { formId } = useParams<{ formId: string }>();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const [schema, setSchema] = useState<FormSchema | null>(null);
  const [schemaError, setSchemaError] = useState<string | null>(null);

  useEffect(() => {
    applyTheme(getStoredTheme());
  }, []);

  const isReal = isRealObjectId(formId);

  // Demo fallback when formId is not a real Sui object id (used for E2E + screenshots).
  useEffect(() => {
    if (!isReal) setSchema(DEMO_SCHEMA);
  }, [isReal]);

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

  async function handleSubmit(payload: SubmissionPayload, fileBlobIds: string[]) {
    if (!schema || !formId) throw new Error("Form not loaded");
    const { txBuilder } = await buildSubmissionTx({
      formId,
      formObjectId: formId,
      policy,
      schema,
      payload,
      fileBlobIds,
    });
    await signAndExecute({ transaction: txBuilder });
  }

  const error = queryError?.message ?? schemaError;
  const isSeal = policy.kind !== "public";

  return (
    <div className="min-h-svh hero-gradient-bg grain text-foreground">
      <header className="px-6 py-4 flex items-center justify-between max-w-3xl mx-auto">
        <Logo />
        <Badge tone={isSeal ? "tertiary" : "neutral"} icon={<Lock className="h-3 w-3" />}>
          {POLICY_LABELS[policy.kind]}
        </Badge>
      </header>

      <main className="px-4 sm:px-6 pb-16">
        <div className="max-w-2xl mx-auto">
          <Card className="liquid-glass-strong rounded-3xl p-8 sm:p-10">
            <div className="flex items-center gap-2 mb-6">
              <ShieldCheck className="h-4 w-4 text-secondary-strong dark:text-secondary" />
              <span className="text-xs uppercase tracking-widest text-muted-foreground">
                Form {formId ? `#${formId.slice(0, 10)}` : ""}
              </span>
            </div>

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
              <FormRenderer schema={schema} formId={formId ?? ""} onSubmit={handleSubmit} />
            )}
          </Card>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Submissions are stored on Walrus. Your wallet owns the resulting Blob NFT.
          </p>
        </div>
      </main>
    </div>
  );
}
