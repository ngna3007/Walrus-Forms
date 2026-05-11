import { SealClient } from "@mysten/seal";
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";

import { FULLNODE_URL, NETWORK, SEAL_KEY_SERVERS } from "../config";

let _suiClient: SuiJsonRpcClient | null = null;
let _sealClient: SealClient | null = null;

export function getSuiClient(): SuiJsonRpcClient {
  if (!_suiClient) {
    _suiClient = new SuiJsonRpcClient({
      url: FULLNODE_URL || getJsonRpcFullnodeUrl(NETWORK),
      network: NETWORK,
    });
  }
  return _suiClient;
}

export function getSealClient(): SealClient {
  if (!_sealClient) {
    _sealClient = new SealClient({
      suiClient: getSuiClient(),
      serverConfigs: SEAL_KEY_SERVERS.map((id) => ({ objectId: id, weight: 1 })),
      verifyKeyServers: false,
    });
  }
  return _sealClient;
}
