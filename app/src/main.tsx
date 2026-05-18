import "@fontsource-variable/inter/index.css";
import "@fontsource-variable/geist/index.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@mysten/dapp-kit/dist/index.css";
import "./styles.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SuiClientProvider, WalletProvider, createNetworkConfig } from "@mysten/dapp-kit";
import { getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { RouterProvider } from "react-router-dom";

import { router } from "./router";
import { NETWORK } from "./config";
import { applyTheme, getStoredTheme } from "./lib/theme";
import { RegisterEnokiWallets } from "./enoki/RegisterEnokiWallets";

applyTheme(getStoredTheme());

const { networkConfig } = createNetworkConfig(
  NETWORK === "mainnet"
    ? { mainnet: { url: getJsonRpcFullnodeUrl("mainnet"), network: "mainnet" } }
    : { testnet: { url: getJsonRpcFullnodeUrl("testnet"), network: "testnet" } },
);

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork={NETWORK}>
        <RegisterEnokiWallets />
        <WalletProvider autoConnect>
          <RouterProvider router={router} />
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  </StrictMode>,
);
