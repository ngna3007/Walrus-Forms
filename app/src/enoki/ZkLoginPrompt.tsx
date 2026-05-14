import { KeyRound, Loader2 } from "lucide-react";
import { useConnectWallet, useCurrentAccount, useWallets } from "@mysten/dapp-kit";
import { isEnokiWallet, isGoogleWallet } from "@mysten/enoki";

import { Button } from "@/components/ui/button";
import { ENOKI_ZKLOGIN_ENABLED } from "@/config";

export function ZkLoginPrompt() {
  const account = useCurrentAccount();
  const wallets = useWallets();
  const { mutate: connect, isPending } = useConnectWallet();
  const googleWallet = wallets.find((wallet) => isEnokiWallet(wallet) && isGoogleWallet(wallet));
  const fallbackEnokiWallet = wallets.find(isEnokiWallet);

  if (account) return null;

  if (!ENOKI_ZKLOGIN_ENABLED) {
    return (
      <div className="rounded-xl border border-border bg-background-soft px-4 py-3 text-left">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <KeyRound className="h-4 w-4 text-primary" />
          zkLogin setup pending
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Add the Enoki public API key and OAuth client ID to enable one-click social login.
        </p>
      </div>
    );
  }

  const wallet = googleWallet ?? fallbackEnokiWallet;

  if (!wallet) {
    return (
      <div className="rounded-xl border border-border bg-background-soft px-4 py-3 text-left text-xs leading-relaxed text-muted-foreground">
        Enoki zkLogin is configured. Refresh if the wallet entry does not appear in the connector list.
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="primary"
      size="lg"
      className="w-full"
      disabled={isPending}
      leftIcon={isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
      onClick={() => connect({ wallet })}
    >
      Continue with Google zkLogin
    </Button>
  );
}
