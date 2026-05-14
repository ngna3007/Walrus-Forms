import { useEffect } from "react";
import { useSuiClientContext } from "@mysten/dapp-kit";
import { isEnokiNetwork, registerEnokiWallets } from "@mysten/enoki";
import type { RegisterEnokiWalletsOptions } from "@mysten/enoki";

import {
  ENOKI_FACEBOOK_CLIENT_ID,
  ENOKI_GOOGLE_CLIENT_ID,
  ENOKI_PUBLIC_API_KEY,
  ENOKI_TWITCH_CLIENT_ID,
  ENOKI_ZKLOGIN_ENABLED,
} from "@/config";

export function RegisterEnokiWallets() {
  const { client, network } = useSuiClientContext();

  useEffect(() => {
    if (!ENOKI_ZKLOGIN_ENABLED || !isEnokiNetwork(network)) return;

    const providers: RegisterEnokiWalletsOptions["providers"] = {};
    if (ENOKI_GOOGLE_CLIENT_ID) providers.google = { clientId: ENOKI_GOOGLE_CLIENT_ID };
    if (ENOKI_FACEBOOK_CLIENT_ID) providers.facebook = { clientId: ENOKI_FACEBOOK_CLIENT_ID };
    if (ENOKI_TWITCH_CLIENT_ID) providers.twitch = { clientId: ENOKI_TWITCH_CLIENT_ID };

    const { unregister } = registerEnokiWallets({
      apiKey: ENOKI_PUBLIC_API_KEY,
      providers,
      client,
      network,
    });

    return unregister;
  }, [client, network]);

  return null;
}
