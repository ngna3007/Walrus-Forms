import { useEffect, useState } from "react";
import { ArrowLeftRight, RefreshCw } from "lucide-react";
import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Badge, StatusDot } from "@/components/ui/badge";
import {
  addSuiToWalSwap,
  estimateSuiForWal,
  exchangeAvailable,
  fetchExchangeRate,
  getSuiBalance,
  getWalBalance,
  resolveExchangeConfig,
  type ExchangeRate,
} from "@/walrus/exchange";
import { formatWal, FROST_PER_WAL } from "@/walrus/cost";

const MIST_PER_SUI = 1_000_000_000n;

function formatSuiMist(mist: bigint): string {
  const whole = mist / MIST_PER_SUI;
  const frac = Number(mist % MIST_PER_SUI) / 1_000_000_000;
  return `${(Number(whole) + frac).toFixed(4)} SUI`;
}

export function WalSwapCard() {
  const client = useSuiClient();
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const [walBalance, setWalBalance] = useState<bigint>(0n);
  const [suiBalance, setSuiBalance] = useState<bigint>(0n);
  const [rate, setRate] = useState<ExchangeRate | null>(null);
  const [exchangeObjectId, setExchangeObjectId] = useState<string | null>(null);
  const [wantWal, setWantWal] = useState<string>("0.5");
  const [swapping, setSwapping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const available = exchangeAvailable();

  async function refresh() {
    if (!account?.address || !available) return;
    setRefreshing(true);
    setError(null);
    try {
      const [wal, sui, config] = await Promise.all([
        getWalBalance(client, account.address),
        getSuiBalance(client, account.address),
        resolveExchangeConfig(client),
      ]);
      setWalBalance(wal);
      setSuiBalance(sui);
      setExchangeObjectId(config.exchangeObjectId);
      const rt = await fetchExchangeRate(client, config.exchangeObjectId);
      setRate(rt);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.address]);

  const wantWalFrost = (() => {
    const parsed = Number(wantWal);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0n;
    return BigInt(Math.floor(parsed * Number(FROST_PER_WAL)));
  })();

  const suiCost = rate && wantWalFrost > 0n ? estimateSuiForWal(wantWalFrost, rate) : 0n;
  const insufficientSui = suiCost > 0n && suiBalance < suiCost;

  async function handleSwap() {
    if (!account?.address || !exchangeObjectId || wantWalFrost <= 0n || !rate) return;
    setError(null);
    setSwapping(true);
    try {
      const tx = new Transaction();
      const suiMist = estimateSuiForWal(wantWalFrost, rate);
      const walCoin = addSuiToWalSwap(
        tx,
        suiMist,
        { exchangeObjectId, exchangePackageId: (await resolveExchangeConfig(client)).exchangePackageId },
        { mode: "gas" },
      );
      // Transfer the resulting WAL coin to the wallet so balance updates.
      tx.transferObjects([walCoin], tx.pure.address(account.address));
      await signAndExecute({ transaction: tx });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSwapping(false);
    }
  }

  if (!available) {
    return (
      <Card className="p-6">
        <Label>SUI → WAL swap</Label>
        <p className="mt-2 text-sm text-muted-foreground">
          The native exchange pool is not configured for the current network. Use the official
          Walrus WAL faucet on testnet instead.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Label>SUI → WAL swap</Label>
          <p className="mt-1 text-sm text-muted-foreground max-w-xl">
            Walrus storage costs WAL. If your wallet only has SUI, convert it here through the
            native exchange. Auto-swap is also wired into the "Extend" button on each submission.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={refresh}
          disabled={refreshing}
          leftIcon={<RefreshCw className={refreshing ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />}
        >
          Refresh
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border bg-background-soft px-3 py-2.5">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">SUI balance</div>
          <div className="mt-1 font-mono text-sm">{formatSuiMist(suiBalance)}</div>
        </div>
        <div className="rounded-lg border border-border bg-background-soft px-3 py-2.5">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">WAL balance</div>
          <div className="mt-1 font-mono text-sm">{formatWal(walBalance)}</div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[140px]">
          <Label>Want WAL</Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={wantWal}
            onChange={(e) => setWantWal(e.target.value)}
            className="mt-1.5"
          />
        </div>
        <Button onClick={handleSwap} disabled={swapping || wantWalFrost <= 0n || !rate || insufficientSui} leftIcon={<ArrowLeftRight className="h-4 w-4" />}>
          {swapping ? "Swapping…" : "Swap"}
        </Button>
      </div>

      {rate && wantWalFrost > 0n ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
          <Badge tone="primary" icon={<StatusDot tone="primary" />}>
            Rate {rate.rateSui.toString()} : {rate.rateWal.toString()}
          </Badge>
          <span className="text-muted-foreground">
            ≈ {formatSuiMist(suiCost)} for {wantWal} WAL
          </span>
          {insufficientSui ? (
            <span className="text-destructive">Not enough SUI in wallet.</span>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div className="mt-3 rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      ) : null}
    </Card>
  );
}
