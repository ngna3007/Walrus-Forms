import { useMemo, useState } from "react";
import { Download, Filter, Lock, Eye, ChevronDown, ExternalLink, Send, Sparkles, Vote } from "lucide-react";
import { useResolveSuiNSName, useSignAndExecuteTransaction } from "@mysten/dapp-kit";

import { AppShell, PageHeader } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge, StatusDot } from "@/components/ui/badge";
import { Select } from "@/components/ui/input";
import { exportCsv } from "@/forms/csv";
import type { FormSchema, SubmissionPayload } from "@/forms/types";
import { calculateReputation } from "@/forms/reputation";
import { buildReleaseBountyTx } from "@/forms/bounty";
import {
  buildCreateReputationTx,
  buildRecordResolutionTx,
  buildRecordSubmissionTx,
} from "@/forms/onchainReputation";
import { buildWebhookDeliveries } from "@/forms/webhooks";
import { buildCastRoadmapVoteTx } from "@/forms/onchainVoting";
import { creditsForVotes, votesFromCredits } from "@/forms/voting";
import { cn, relativeTime, truncateAddr, truncateBlob } from "@/lib/utils";
import { MarkdownView } from "@/components/MarkdownView";
import { PACKAGE_CONFIGURED } from "@/config";

const STATUS = ["Open", "Triaged", "In Progress", "Resolved"] as const;
const STATUS_TONE: ("neutral" | "primary" | "tertiary" | "secondary")[] = ["neutral", "primary", "tertiary", "secondary"];

interface Row {
  submissionId: string;
  submitter: string;
  status: number;
  submittedAtMs: number;
  blobId: string;
  decrypted: boolean;
  payload?: SubmissionPayload;
}

const DEMO_SCHEMA: FormSchema = {
  version: 1,
  title: "Bug Reports",
  integrations: {
    webhooks: [
      { id: "slack-demo", kind: "slack", target: "#bug-intake", enabled: true },
      { id: "linear-demo", kind: "linear", target: "WAL", enabled: true },
    ],
  },
  bounty: { enabled: true, tokenSymbol: "WAL", payoutAmount: "25" },
  featureVoting: { enabled: true, quadratic: true },
  fields: [
    { id: "summary", type: "shortText", label: "Summary", required: true },
    { id: "severity", type: "dropdown", label: "Severity", required: true, options: ["Low", "Medium", "High", "Critical"] },
  ],
};

const DEMO_ROWS: Row[] = [
  {
    submissionId: "0xa1b2c3",
    submitter: "0x9F3aA1ce4982FE1abf3829FFbC32d5Dba2Ee84cd",
    status: 0,
    submittedAtMs: Date.now() - 1000 * 60 * 12,
    blobId: "Bk_MTV7C5jCwKZsVu7ZxX9iWMszPjN",
    decrypted: true,
    payload: {
      version: 1,
      formId: "bug",
      submittedAt: Date.now() - 1000 * 60 * 12,
      values: {
        summary: { type: "text", value: "Wallet popup blocked on Safari iOS" },
        severity: { type: "dropdown", value: "High" },
      },
    },
  },
  {
    submissionId: "0xa1b2c4",
    submitter: "0x4Fc91dEaA02D5b90B3F2Ab63FE5eA3A09b1aBcDe",
    status: 1,
    submittedAtMs: Date.now() - 1000 * 60 * 60 * 3,
    blobId: "Bk_QMV7B4jCwLpqYu7ZxXZQAN",
    decrypted: false,
  },
  {
    submissionId: "0xa1b2c5",
    submitter: "0x8eF11bAa3c50dE12c33Fa9Bd71Fc83aE71d3DEFf",
    status: 2,
    submittedAtMs: Date.now() - 1000 * 60 * 60 * 22,
    blobId: "Bk_RNW7B5jCwLpqYu7ZxX9iWN",
    decrypted: true,
    payload: {
      version: 1,
      formId: "bug",
      submittedAt: Date.now() - 1000 * 60 * 60 * 22,
      values: {
        summary: { type: "text", value: "CSV export drops the last column when description has commas" },
        severity: { type: "dropdown", value: "Medium" },
      },
    },
  },
  {
    submissionId: "0xa1b2c6",
    submitter: "0x2Aa991Be4F9c0C9Ae62D3Fb71Ec43aE71b3CE112",
    status: 3,
    submittedAtMs: Date.now() - 1000 * 60 * 60 * 24 * 3,
    blobId: "Bk_RAW7C5jCwLpqYu7ZxX",
    decrypted: true,
    payload: {
      version: 1,
      formId: "bug",
      submittedAt: Date.now() - 1000 * 60 * 60 * 24 * 3,
      values: {
        summary: { type: "text", value: "Move publish gas estimate is way under" },
        severity: { type: "dropdown", value: "Low" },
      },
    },
  },
];

export function AdminPage() {
  const [schema] = useState<FormSchema>(DEMO_SCHEMA);
  const [rows, setRows] = useState<Row[]>(DEMO_ROWS);
  const [statusFilter, setStatusFilter] = useState<number | "all">("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<Record<string, number>>({});

  const filtered = useMemo(
    () => (statusFilter === "all" ? rows : rows.filter((r) => r.status === statusFilter)),
    [rows, statusFilter],
  );

  const newCount = rows.filter((r) => r.status === 0).length;

  function transition(row: Row, status: number) {
    setRows((prev) => prev.map((r) => (r.submissionId === row.submissionId ? { ...r, status } : r)));
  }

  function forwardWebhooks(row: Row) {
    if (!row.payload) return;
    const count = buildWebhookDeliveries(schema.integrations?.webhooks, row.payload).length;
    setDeliveries((prev) => ({ ...prev, [row.submissionId]: count }));
  }

  function handleExport() {
    const payloads = filtered.map((r) => r.payload).filter((p): p is SubmissionPayload => Boolean(p));
    const csv = exportCsv(schema, payloads);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${schema.title.replace(/\s+/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
        title={schema.title}
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
              <p className="mt-2 text-sm">Share your form link to get started.</p>
            </li>
          )}
          {filtered.map((row) => (
            <li key={row.submissionId} className="border-b border-border/40 last:border-0">
              <button
                type="button"
                onClick={() => setOpenId(openId === row.submissionId ? null : row.submissionId)}
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
                <div className="flex items-center gap-2 justify-end">
                  {deliveries[row.submissionId] ? (
                    <Badge tone="secondary">{deliveries[row.submissionId]} sent</Badge>
                  ) : null}
                  {!row.decrypted && (
                    <Button size="sm" variant="outline" leftIcon={<Eye className="h-3.5 w-3.5" />}>
                      Decrypt
                    </Button>
                  )}
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 text-muted-foreground transition-transform",
                      openId === row.submissionId && "rotate-180",
                    )}
                  />
                </div>
              </button>
              {openId === row.submissionId && row.payload && (
                <Drawer
                  schema={schema}
                  row={row}
                  onTransition={(s) => transition(row, s)}
                  onForward={() => forwardWebhooks(row)}
                />
              )}
            </li>
          ))}
        </ul>
      </Card>
    </AppShell>
  );
}

function SubmitterName({ address }: { address: string }) {
  const { data: name } = useResolveSuiNSName(address, { staleTime: 60_000 });
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
}: {
  schema: FormSchema;
  row: Row;
  onTransition: (s: number) => void;
  onForward: () => void;
}) {
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const [chainError, setChainError] = useState<string | null>(null);
  const [reputationObjectId, setReputationObjectId] = useState("");

  if (!row.payload) return null;

  const reputation = calculateReputation(row.submitter, row.payload);
  const webhookCount = buildWebhookDeliveries(schema.integrations?.webhooks, row.payload).length;
  const submitterIsSuiAddress = isObjectId(row.submitter);
  const canUseChain = PACKAGE_CONFIGURED && submitterIsSuiAddress;
  const canReleaseBounty = Boolean(PACKAGE_CONFIGURED && schema.bounty?.escrowObjectId && submitterIsSuiAddress);

  async function releaseBounty() {
    if (!schema.bounty?.escrowObjectId) return;
    setChainError(null);
    try {
      await signAndExecute({
        transaction: buildReleaseBountyTx({
          bountyObjectId: schema.bounty.escrowObjectId,
          recipient: row.submitter,
          tokenSymbol: schema.bounty.tokenSymbol,
        }),
      });
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

  async function createReputationRecord() {
    setChainError(null);
    try {
      await signAndExecute({ transaction: buildCreateReputationTx(row.submitter) });
    } catch (err) {
      setChainError(err instanceof Error ? err.message : String(err));
    }
  }

  async function recordReputationSubmission() {
    if (!isObjectId(reputationObjectId)) return;
    setChainError(null);
    try {
      await signAndExecute({ transaction: buildRecordSubmissionTx(reputationObjectId) });
    } catch (err) {
      setChainError(err instanceof Error ? err.message : String(err));
    }
  }

  async function recordReputationResolution() {
    if (!isObjectId(reputationObjectId)) return;
    setChainError(null);
    try {
      await signAndExecute({ transaction: buildRecordResolutionTx(reputationObjectId) });
    } catch (err) {
      setChainError(err instanceof Error ? err.message : String(err));
    }
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
                    {v?.type === "text" && (f.type === "richText" ? <MarkdownView src={v.value} /> : v.value)}
                    {v?.type === "url" && (
                      <a href={v.value} className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
                        {v.value}
                      </a>
                    )}
                    {v?.type === "dropdown" && <Badge tone="primary">{v.value}</Badge>}
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
          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            className="mt-6 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"
          >
            View on Sui Explorer <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Triage</div>
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
            <div className="mt-2 text-xs text-muted-foreground">
              Local preview score from this submitter. Create an on-chain record after contracts are deployed.
            </div>
            <div className="mt-3 grid gap-2">
              {!PACKAGE_CONFIGURED && (
                <div className="rounded-md border border-tertiary/30 bg-tertiary/10 px-2 py-2 text-xs text-tertiary-strong dark:text-tertiary">
                  On-chain actions are disabled because `PACKAGE_ID` is still `0x0`. Publish contracts and update `app/src/config.ts`.
                </div>
              )}
              {PACKAGE_CONFIGURED && !submitterIsSuiAddress && (
                <div className="rounded-md border border-tertiary/30 bg-tertiary/10 px-2 py-2 text-xs text-tertiary-strong dark:text-tertiary">
                  This demo row uses a sample address. Live Sui submissions will enable on-chain reputation actions.
                </div>
              )}
              <input
                className="h-9 rounded-md bg-background-soft border border-border px-2 font-mono text-xs"
                value={reputationObjectId}
                onChange={(e) => setReputationObjectId(e.target.value)}
                placeholder="Paste on-chain reputation record object id"
              />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!canUseChain}
                  onClick={createReputationRecord}
                >
                  Create record
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!PACKAGE_CONFIGURED || !isObjectId(reputationObjectId)}
                  onClick={recordReputationSubmission}
                >
                  +Submit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!PACKAGE_CONFIGURED || !isObjectId(reputationObjectId)}
                  onClick={recordReputationResolution}
                >
                  +Resolved
                </Button>
              </div>
              <div className="text-[11px] leading-relaxed text-muted-foreground">
                `Create record` opens a wallet transaction. After it succeeds, copy the new `SubmitterReputation` object id from Suiscan and paste it here to update counts.
              </div>
            </div>
          </div>
          <Select
            value={row.status}
            onChange={(e) => onTransition(Number(e.target.value))}
          >
            {STATUS.map((s, i) => (
              <option key={i} value={i}>
                {s}
              </option>
            ))}
          </Select>
          <Button
            size="sm"
            variant="secondary"
            className="mt-3 w-full"
            onClick={() => onTransition(3)}
          >
            Mark resolved
          </Button>
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
          {schema.bounty?.enabled ? (
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

function isObjectId(value: string | undefined): value is string {
  return Boolean(value && /^0x[0-9a-fA-F]{64}$/.test(value));
}
