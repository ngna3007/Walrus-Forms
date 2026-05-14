import { useEffect, useState } from "react";
import { Clock, RefreshCw, AlertTriangle, CalendarPlus, ArrowLeftRight } from "lucide-react";
import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge, StatusDot } from "@/components/ui/badge";
import { NETWORK, WALRUS_DEFAULT_EPOCHS } from "@/config";
import {
  buildExtendBlobTx,
  formatEpochsRemaining,
  summarizeLifecycle,
  type LifecycleSummary,
} from "@/walrus/lifecycle";
import { ensureWalSwap, exchangeAvailable } from "@/walrus/exchange";
import { cn, truncateBlob } from "@/lib/utils";

/**
 * Renders Walrus storage status for a single blob: time remaining, expiry epoch,
 * and an inline "extend" form. Used inside the admin submission drawer.
 *
 * Pass `blobObjectId` (the Sui Blob NFT object id, NOT the content-addressed
 * blob id string). Returns null if the blob has no on-chain object yet (e.g.
 * publisher-hosted blobs where we don't own the Sui NFT).
 */
export interface WalrusBlobStatusProps {
  blobObjectId: string | undefined;
  blobId?: string;
  /** Hide the extend form if the viewer doesn't own this blob. */
  canExtend?: boolean;
  label?: string;
}

export function WalrusBlobStatus({
  blobObjectId,
  blobId,
  canExtend = true,
  label,
}: WalrusBlobStatusProps) {
  const client = useSuiClient();
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const [summary, setSummary] = useState<LifecycleSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [extending, setExtending] = useState(false);
  const [extendBy, setExtendBy] = useState<number>(WALRUS_DEFAULT_EPOCHS);
  const [error, setError] = useState<string | null>(null);
  const [swapNote, setSwapNote] = useState<string | null>(null);

  useEffect(() => {
    if (!blobObjectId) {
      setLoading(false);
      setSummary(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    summarizeLifecycle(client, blobObjectId)
      .then((next) => {
        if (cancelled) return;
        setSummary(next);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [blobObjectId, client]);

  async function handleExtend() {
    if (!blobObjectId) return;
    setError(null);
    setSwapNote(null);
    setExtending(true);
    try {
      const tx = new Transaction();
      let walCoin: import("@mysten/sui/transactions").TransactionObjectArgument | undefined;
      if (account?.address && exchangeAvailable()) {
        try {
          // Rough WAL estimate is hard before tx build; ask Walrus SDK what it
          // costs and use that to decide whether to splice in a SUI→WAL swap.
          const { storageFrost } = await import("@/walrus/cost").then((m) =>
            m.estimateStorageCost(1, extendBy),
          );
          const swapped = await ensureWalSwap(client, account.address, storageFrost, tx);
          if (swapped.walCoin) {
            walCoin = swapped.walCoin;
            setSwapNote(`Auto-swapped SUI → WAL for this extend (${swapped.suiMistConsumed} MIST).`);
          }
        } catch (swapErr) {
          // Non-fatal; user may already have enough WAL.
          console.warn("SUI→WAL swap step skipped", swapErr);
        }
      }
      const built = await buildExtendBlobTx(blobObjectId, extendBy, {
        walCoin,
        transaction: tx,
      });
      await signAndExecute({ transaction: built });
      const next = await summarizeLifecycle(client, blobObjectId);
      setSummary(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExtending(false);
    }
  }

  if (!blobObjectId) {
    return (
      <div className="rounded-lg border border-border bg-background-soft px-3 py-2 text-xs text-muted-foreground">
        Blob not tracked on Sui (publisher-hosted upload). Lifetime cannot be queried.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-background-soft px-3 py-2 text-xs text-muted-foreground inline-flex items-center gap-1.5">
        <RefreshCw className="h-3 w-3 animate-spin" /> Reading lifetime…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
        Lifetime read failed: {error}
      </div>
    );
  }

  if (!summary) return null;

  const remainingLabel = formatEpochsRemaining(summary.epochsRemaining, NETWORK);
  const tone = summary.expired
    ? "destructive"
    : summary.epochsRemaining <= 2
      ? "tertiary"
      : "secondary";

  return (
    <div className="rounded-lg border border-border bg-background-soft px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs font-medium">
            {label ?? "Walrus storage"}
          </span>
          {blobId ? (
            <span className="font-mono text-[10px] text-muted-foreground truncate">
              {truncateBlob(blobId, 14)}
            </span>
          ) : null}
        </div>
        <Badge tone={tone} icon={<StatusDot tone={tone} />}>
          {remainingLabel}
        </Badge>
      </div>
      <div className="mt-1.5 grid grid-cols-3 gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
        <div>
          <div>Current</div>
          <div className="mt-0.5 font-mono text-foreground">epoch {summary.currentEpoch}</div>
        </div>
        <div>
          <div>Ends at</div>
          <div className="mt-0.5 font-mono text-foreground">epoch {summary.blob.endEpoch}</div>
        </div>
        <div>
          <div>Certified</div>
          <div className="mt-0.5 font-mono text-foreground">
            {summary.blob.certifiedEpoch ?? "—"}
          </div>
        </div>
      </div>
      {canExtend && !summary.expired ? (
        <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-border/60 pt-3">
          <div className="flex-1 min-w-[120px]">
            <Label>Extend by</Label>
            <Input
              type="number"
              min={1}
              max={53}
              value={extendBy}
              onChange={(e) => setExtendBy(Math.max(1, Math.min(53, Number(e.target.value) || 1)))}
              className="mt-1 h-8 text-xs"
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={extending}
            onClick={handleExtend}
            leftIcon={<CalendarPlus className="h-3.5 w-3.5" />}
          >
            {extending ? "Extending…" : `Extend ${extendBy} epoch${extendBy === 1 ? "" : "s"}`}
          </Button>
          <p className="basis-full text-[10px] text-muted-foreground">
            Max 53 epochs. Only the blob owner can extend. {NETWORK === "testnet" ? "1 epoch ≈ 1 day" : "1 epoch ≈ 14 days"}.
            {exchangeAvailable()
              ? " SUI is auto-swapped to WAL if your wallet is short."
              : ""}
          </p>
          {swapNote ? (
            <p className="basis-full text-[10px] text-primary inline-flex items-center gap-1.5">
              <ArrowLeftRight className="h-3 w-3" /> {swapNote}
            </p>
          ) : null}
        </div>
      ) : summary.expired ? (
        <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-destructive">
          <AlertTriangle className={cn("h-3 w-3")} /> Storage expired. Blob may already be unavailable.
        </div>
      ) : null}
    </div>
  );
}
