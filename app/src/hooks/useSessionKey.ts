import { useCallback, useEffect, useRef } from "react";
import { SessionKey } from "@mysten/seal";
import { useCurrentAccount, useSignPersonalMessage } from "@mysten/dapp-kit";

import { PACKAGE_ID, SESSION_KEY_TTL_MIN } from "@/config";
import { getSuiClient } from "@/seal/client";

/**
 * Component-scoped Seal SessionKey helper.
 *
 * - One SessionKey per mounted hook; cleared when the wallet address changes or the
 *   component unmounts.
 * - Uses the SDK's own `SessionKey.isExpired()` rather than tracking TTL manually.
 * - Prompts the wallet for a personal-message signature only on first use or after
 *   expiry; reuses the signed session for subsequent decrypts.
 *
 * Mirrors the canonical pattern from sui-move-bootcamp K5 seal-demo.
 */
export function useSessionKey() {
  const account = useCurrentAccount();
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();
  const ref = useRef<SessionKey | null>(null);

  useEffect(() => {
    // Clear cached session when the wallet address changes or disconnects so we
    // never reuse a signed session under a different signer.
    ref.current = null;
  }, [account?.address]);

  const ensure = useCallback(async (): Promise<SessionKey> => {
    if (!account?.address) throw new Error("Connect a wallet to decrypt this submission.");

    if (ref.current && !ref.current.isExpired() && ref.current.getAddress() === account.address) {
      return ref.current;
    }

    const sk = await SessionKey.create({
      address: account.address,
      packageId: PACKAGE_ID,
      ttlMin: SESSION_KEY_TTL_MIN,
      suiClient: getSuiClient(),
    });

    const message = sk.getPersonalMessage();
    const { signature } = await signPersonalMessage({ message });
    await sk.setPersonalMessageSignature(signature);

    ref.current = sk;
    return sk;
  }, [account?.address, signPersonalMessage]);

  const clear = useCallback(() => {
    ref.current = null;
  }, []);

  return { ensure, clear };
}
