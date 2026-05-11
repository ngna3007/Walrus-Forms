import type { ReactNode } from "react";
import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit";
import { Wallet } from "lucide-react";

import { Card } from "@/components/ui/card";

export function ConnectGate({ children, message }: { children: ReactNode; message?: string }) {
  const account = useCurrentAccount();
  if (account) return <>{children}</>;

  return (
    <Card className="p-10 text-center max-w-lg mx-auto">
      <div className="h-12 w-12 mx-auto rounded-full bg-primary/10 text-primary flex items-center justify-center">
        <Wallet className="h-5 w-5" />
      </div>
      <h2 className="mt-4 font-serif italic text-2xl">Connect a wallet</h2>
      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
        {message ?? "Connect a Sui wallet to publish forms, sign submissions, and triage."}
      </p>
      <div className="mt-6 flex justify-center">
        <ConnectButton />
      </div>
    </Card>
  );
}
