import { useEffect, useRef, useState } from "react";
import { ConnectModal, useCurrentAccount, useDisconnectWallet } from "@mysten/dapp-kit";
import { Wallet, Copy, LogOut, ExternalLink, Check } from "lucide-react";

import { StatusDot } from "@/components/ui/badge";
import { cn, copyText, truncateAddr } from "@/lib/utils";
import { setCurrentOwner } from "@/lib/ownerKey";
import { NETWORK } from "@/config";

export function WalletWidget() {
  const account = useCurrentAccount();
  const { mutate: disconnect } = useDisconnectWallet();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCurrentOwner(account?.address ?? null);
  }, [account?.address]);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (!account) {
    return (
      <ConnectModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        trigger={
          <button
            type="button"
            className={cn(
              "w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm",
              "border border-border bg-background-soft text-foreground",
              "hover:border-primary/40 hover:bg-primary/5 transition-colors cursor-pointer",
            )}
          >
            <span className="h-7 w-7 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center">
              <Wallet className="h-3.5 w-3.5" />
            </span>
            <span className="flex-1 text-left font-medium">Connect wallet</span>
          </button>
        }
      />
    );
  }

  async function handleCopy() {
    if (!account) return;
    await copyText(account.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left",
          "hover:bg-background-soft transition-colors cursor-pointer",
          open && "bg-background-soft",
        )}
        aria-expanded={open}
      >
        <span className="h-7 w-7 shrink-0 rounded-full bg-gradient-to-br from-primary via-secondary to-tertiary" />
        <span className="flex-1 min-w-0">
          <span className="block font-mono text-xs truncate">{truncateAddr(account.address)}</span>
          <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-widest">
            <StatusDot tone="secondary" />
            Testnet
          </span>
        </span>
      </button>

      {open && (
        <div
          className={cn(
            "absolute bottom-full left-0 right-0 mb-2 rounded-xl border border-border bg-popover shadow-xl overflow-hidden z-50",
          )}
        >
          <div className="px-3 py-2.5 border-b border-border/60">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Connected</div>
            <div className="mt-1 font-mono text-xs break-all">{account.address}</div>
          </div>

          <button
            type="button"
            onClick={handleCopy}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-background-soft transition-colors"
          >
            {copied ? (
              <Check className="h-4 w-4 text-secondary-strong dark:text-secondary" />
            ) : (
              <Copy className="h-4 w-4 text-muted-foreground" />
            )}
            {copied ? "Copied" : "Copy address"}
          </button>

          <a
            href={`https://suiscan.xyz/${NETWORK}/account/${account.address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-background-soft transition-colors"
            onClick={() => setOpen(false)}
          >
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
            View on Suiscan
          </a>

          <button
            type="button"
            onClick={() => {
              disconnect();
              setOpen(false);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors border-t border-border/60"
          >
            <LogOut className="h-4 w-4" />
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
