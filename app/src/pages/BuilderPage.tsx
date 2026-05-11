import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Gift, Globe, Lock, Clock, Coins, Send, ExternalLink, Store, Vote } from "lucide-react";
import { useCurrentAccount, useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { fromHex } from "@mysten/sui/utils";

import { AppShell, PageHeader } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { FormBuilder } from "@/components/FormBuilder";
import { FormRenderer } from "@/components/FormRenderer";
import { buildSponsorBountyTx, parseTokenAmount } from "@/forms/bounty";
import { buildCreateVotingBoardTx } from "@/forms/onchainVoting";
import type { FormPolicy } from "@/forms/submit";
import type { FormSchema, WebhookSettings } from "@/forms/types";
import { FORM_TEMPLATES, cloneTemplateSchema } from "@/forms/templates";
import { storeBlob } from "@/walrus/client";
import { PACKAGE_CONFIGURED, PACKAGE_ID } from "@/config";
import { cn } from "@/lib/utils";

const DEMO_SCHEMA: FormSchema = {
  version: 1,
  title: "Bug Report",
  description: "Tell us what broke. Stays encrypted with Seal until a triager opens it.",
  fields: [
    { id: "summary", type: "shortText", label: "Summary", required: true },
    { id: "details", type: "longText", label: "Steps to reproduce", required: true },
    {
      id: "severity",
      type: "dropdown",
      label: "Severity",
      required: true,
      options: ["Low", "Medium", "High", "Critical"],
    },
    { id: "screenshot", type: "screenshot", label: "Screenshot", required: false },
  ],
};

const POLICIES: { kind: FormPolicy["kind"]; label: string; description: string; icon: React.ReactNode; tone: "neutral" | "primary" | "secondary" | "tertiary" }[] = [
  { kind: "public", label: "Public", description: "Anyone can see submissions.", icon: <Globe className="h-4 w-4" />, tone: "neutral" },
  { kind: "allowlist", label: "Allowlist", description: "Only listed addresses can decrypt.", icon: <Lock className="h-4 w-4" />, tone: "secondary" },
  { kind: "timelock", label: "Time-locked", description: "Decrypts after a set time.", icon: <Clock className="h-4 w-4" />, tone: "tertiary" },
  { kind: "tokenGated", label: "Token-gated", description: "NFT or token holders only.", icon: <Coins className="h-4 w-4" />, tone: "primary" },
];

export function BuilderPage() {
  const account = useCurrentAccount();
  const navigate = useNavigate();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const [schema, setSchema] = useState<FormSchema>(DEMO_SCHEMA);
  const [policy, setPolicy] = useState<FormPolicy>({ kind: "public" });
  const [webhooks, setWebhooks] = useState<WebhookSettings[]>([]);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [publishing, setPublishing] = useState(false);
  const [lastDigest, setLastDigest] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handlePublish() {
    if (!account) return;
    setError(null);
    setPublishing(true);
    try {
      const publishSchema: FormSchema = {
        ...schema,
        integrations: webhooks.length > 0 ? { webhooks } : schema.integrations,
      };
      const schemaBytes = new TextEncoder().encode(JSON.stringify(publishSchema));
      const { blobId } = await storeBlob(schemaBytes);
      const policyObjectId =
        policy.kind === "allowlist"
          ? objectIdToBytes(policy.allowlistObjectId)
          : policy.kind === "tokenGated"
          ? objectIdToBytes(policy.gateObjectId)
          : [];

      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::form_registry::create_form`,
        arguments: [
          tx.pure.string(schema.title),
          tx.pure.string(blobId),
          tx.pure.u8(
            policy.kind === "allowlist"
              ? 1
              : policy.kind === "timelock"
              ? 2
              : policy.kind === "tokenGated"
              ? 3
              : 0,
          ),
          tx.pure.vector("u8", policyObjectId),
          tx.pure.u64(policy.kind === "timelock" ? policy.unlockTimeMs : 0),
        ],
      });

      const result = (await signAndExecute({ transaction: tx })) as { digest?: string };
      setLastDigest(result.digest ?? null);
      // Move package returns a shared Form object via emitted event; for demo we route by digest.
      setTimeout(() => navigate(`/admin/${encodeURIComponent(result.digest ?? "preview")}`), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPublishing(false);
    }
  }

  return (
    <AppShell
      action={
        account ? (
          <Button onClick={handlePublish} disabled={publishing} leftIcon={<Send className="h-4 w-4" />}>
            {publishing ? "Publishing…" : "Publish to Sui"}
          </Button>
        ) : null
      }
    >
      <PageHeader
        eyebrow="Builder"
        title="Compose a form"
        description="Drag fields, pick a Seal policy, ship a shareable link."
      />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 flex flex-col gap-4">
          <Card className="p-6">
            <div className="mb-5">
              <Label>Templates marketplace</Label>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
                {FORM_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => {
                      const next = cloneTemplateSchema(template.id);
                      if (next) setSchema(next);
                    }}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left transition-colors",
                      schema.templateId === template.id
                        ? "border-primary bg-primary/8"
                        : "border-border bg-background-soft hover:border-primary/40",
                    )}
                  >
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Store className="h-3.5 w-3.5 text-primary" />
                      {template.name}
                    </div>
                    <div className="mt-1 text-[11px] uppercase tracking-widest text-muted-foreground">
                      {template.category}
                    </div>
                  </button>
                ))}
              </div>
            </div>

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
                      else if (p.kind === "allowlist") setPolicy({ kind: "allowlist", allowlistObjectId: "" });
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
                      {active && <Badge tone={p.tone}>Active</Badge>}
                    </div>
                    <div className="mt-3 font-medium text-sm">{p.label}</div>
                    <div className="mt-1 text-xs text-muted-foreground leading-relaxed">{p.description}</div>
                  </button>
                );
              })}
            </div>
            <PolicyDetails policy={policy} setPolicy={setPolicy} />
          </Card>

          <RoadmapSettings
            schema={schema}
            setSchema={setSchema}
            webhooks={webhooks}
            setWebhooks={setWebhooks}
          />
        </div>

        <aside className="lg:col-span-2 flex flex-col gap-4">
          <Card className="p-4 sticky top-20">
            <div className="flex items-center justify-between mb-3">
              <Label>Live preview</Label>
              <div className="flex items-center gap-1 p-0.5 rounded-md bg-background-soft border border-border text-xs">
                {(["desktop", "mobile"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPreviewMode(m)}
                    className={cn(
                      "px-2.5 py-1 rounded transition-colors",
                      previewMode === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <div
              className={cn(
                "rounded-xl bg-background-soft border border-border/60 overflow-hidden",
                previewMode === "mobile" ? "max-w-[360px] mx-auto" : "",
              )}
            >
              <FormRenderer schema={schema} formId="preview" onSubmit={async () => {}} />
            </div>
          </Card>

          {error && (
            <Card className="p-4 border-destructive/40 bg-destructive/10">
              <Label className="text-destructive">Publish failed</Label>
              <p className="mt-1 text-xs text-destructive/90 break-words">{error}</p>
            </Card>
          )}

          {lastDigest && (
            <Card className="p-4">
              <Label>Published</Label>
              <div className="mt-2 font-mono text-xs text-muted-foreground break-all">
                tx: {lastDigest}
              </div>
              <Button
                size="sm"
                variant="outline"
                leftIcon={<ExternalLink className="h-3.5 w-3.5" />}
                className="mt-3"
                onClick={() =>
                  window.open(`https://suiscan.xyz/testnet/tx/${lastDigest}`, "_blank")
                }
              >
                View on Suiscan
              </Button>
            </Card>
          )}
        </aside>
      </div>
    </AppShell>
  );
}

function objectIdToBytes(id: string): number[] {
  if (!/^0x[0-9a-fA-F]{64}$/.test(id)) return [];
  return Array.from(fromHex(id));
}

function PolicyDetails({ policy, setPolicy }: { policy: FormPolicy; setPolicy: (p: FormPolicy) => void }) {
  if (policy.kind === "public") return null;
  return (
    <div className="mt-5 grid gap-3">
      {policy.kind === "allowlist" && (
        <div>
          <Label>Allowlist object id</Label>
          <Input
            className="mt-1.5 font-mono text-xs"
            value={policy.allowlistObjectId}
            onChange={(e) => setPolicy({ kind: "allowlist", allowlistObjectId: e.target.value })}
            placeholder="0x…"
          />
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
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const bounty = schema.bounty ?? { enabled: false, tokenSymbol: "WAL" as const, payoutAmount: "0" };
  const voting = schema.featureVoting ?? { enabled: false, quadratic: true };
  const [formObjectId, setFormObjectId] = useState("");
  const [walCoinObjectId, setWalCoinObjectId] = useState("");
  const [chainBusy, setChainBusy] = useState<"bounty" | "voting" | null>(null);
  const [chainMessage, setChainMessage] = useState<string | null>(null);

  function patchBounty(patch: Partial<typeof bounty>) {
    setSchema({ ...schema, bounty: { ...bounty, ...patch } });
  }

  function patchVoting(patch: Partial<typeof voting>) {
    setSchema({ ...schema, featureVoting: { ...voting, ...patch } });
  }

  function updateWebhook(index: number, patch: Partial<WebhookSettings>) {
    setWebhooks(webhooks.map((hook, i) => (i === index ? { ...hook, ...patch } : hook)));
  }

  async function sponsorBounty() {
    setChainMessage(null);
    setChainBusy("bounty");
    try {
      await signAndExecute({
        transaction: buildSponsorBountyTx({
          formId: formObjectId,
          amountMist: parseTokenAmount(bounty.payoutAmount),
          tokenSymbol: bounty.tokenSymbol,
          coinObjectId: bounty.tokenSymbol === "WAL" ? walCoinObjectId : undefined,
        }),
      });
      setChainMessage("Bounty escrow transaction submitted.");
    } catch (err) {
      setChainMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setChainBusy(null);
    }
  }

  async function createVotingBoard() {
    setChainMessage(null);
    setChainBusy("voting");
    try {
      await signAndExecute({
        transaction: buildCreateVotingBoardTx(formObjectId, voting.quadratic),
      });
      setChainMessage("Voting board transaction submitted.");
    } catch (err) {
      setChainMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setChainBusy(null);
    }
  }

  const hasFormObject = /^0x[0-9a-fA-F]{64}$/.test(formObjectId);
  const hasWalCoin = /^0x[0-9a-fA-F]{64}$/.test(walCoinObjectId);

  return (
    <Card className="p-6">
      <div className="grid gap-5">
        <div>
          <Label>Published form object id</Label>
          <Input
            className="mt-1.5 font-mono text-xs"
            value={formObjectId}
            onChange={(e) => setFormObjectId(e.target.value)}
            placeholder="0x…"
          />
          {!PACKAGE_CONFIGURED && (
            <div className="mt-2 rounded-md border border-tertiary/30 bg-tertiary/10 px-2 py-2 text-xs text-tertiary-strong dark:text-tertiary">
              Escrow and voting board actions are disabled until contracts are published and `PACKAGE_ID` is updated.
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center gap-2">
            <Gift className="h-4 w-4 text-secondary-strong dark:text-secondary" />
            <Label>Sponsored bounty</Label>
          </div>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-[auto_1fr_120px] gap-3 items-center">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="accent-primary"
                checked={bounty.enabled}
                onChange={(e) => patchBounty({ enabled: e.target.checked })}
              />
              Enable escrow metadata
            </label>
            <Input
              value={bounty.payoutAmount}
              onChange={(e) => patchBounty({ payoutAmount: e.target.value })}
              placeholder="Payout amount"
              disabled={!bounty.enabled}
            />
            <select
              className="h-10 rounded-lg bg-background-soft border border-border px-3 text-sm"
              value={bounty.tokenSymbol}
              onChange={(e) => patchBounty({ tokenSymbol: e.target.value as "WAL" | "SUI" })}
              disabled={!bounty.enabled}
            >
              <option value="WAL">WAL</option>
              <option value="SUI">SUI</option>
            </select>
          </div>
          {bounty.enabled && bounty.tokenSymbol === "WAL" && (
            <div className="mt-3">
              <Label>WAL coin object id</Label>
              <Input
                className="mt-1.5 font-mono text-xs"
                value={walCoinObjectId}
                onChange={(e) => setWalCoinObjectId(e.target.value)}
                placeholder="Owned Coin<WAL> object to split into escrow"
              />
            </div>
          )}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="mt-3"
            disabled={!PACKAGE_CONFIGURED || !bounty.enabled || !hasFormObject || chainBusy !== null || (bounty.tokenSymbol === "WAL" && !hasWalCoin)}
            onClick={sponsorBounty}
          >
            {chainBusy === "bounty" ? "Sponsoring..." : "Sponsor escrow"}
          </Button>
        </div>

        <div>
          <div className="flex items-center gap-2">
            <Vote className="h-4 w-4 text-tertiary-strong dark:text-tertiary" />
            <Label>Feature request voting</Label>
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                className="accent-primary"
                checked={voting.enabled}
                onChange={(e) => patchVoting({ enabled: e.target.checked })}
              />
              Enable voting
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                className="accent-primary"
                checked={voting.quadratic}
                disabled={!voting.enabled}
                onChange={(e) => patchVoting({ quadratic: e.target.checked })}
              />
              Quadratic credits
            </label>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-3"
            disabled={!PACKAGE_CONFIGURED || !voting.enabled || !hasFormObject || chainBusy !== null}
            onClick={createVotingBoard}
          >
            {chainBusy === "voting" ? "Creating..." : "Create voting board"}
          </Button>
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
        {chainMessage && (
          <div className="rounded-lg border border-border bg-background-soft px-3 py-2 text-xs text-muted-foreground break-words">
            {chainMessage}
          </div>
        )}
      </div>
    </Card>
  );
}
