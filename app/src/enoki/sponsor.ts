import { toBase64 } from "@mysten/sui/utils";
import type { SuiJsonRpcClient, SuiTransactionBlockResponse } from "@mysten/sui/jsonRpc";
import type { Transaction } from "@mysten/sui/transactions";

import { ENOKI_SPONSOR_URL, NETWORK } from "@/config";

export interface SponsoredTxAllowlist {
  allowedMoveCallTargets: string[];
  allowedAddresses: string[];
}

export interface SponsoredTxDraft {
  digest: string;
  bytes: string;
}

export async function createSponsoredSubmissionTransaction({
  transaction,
  client,
  sender,
  allowlist,
}: {
  transaction: Transaction;
  client: SuiJsonRpcClient;
  sender: string;
  allowlist: SponsoredTxAllowlist;
}): Promise<SponsoredTxDraft> {
  const kindBytes = await transaction.build({ client, onlyTransactionKind: true });
  const response = await postJson<SponsoredTxDraft>("/api/enoki/sponsor", {
    network: NETWORK,
    transactionBlockKindBytes: toBase64(kindBytes),
    sender,
    allowedMoveCallTargets: allowlist.allowedMoveCallTargets,
    allowedAddresses: allowlist.allowedAddresses,
  });
  return response;
}

export async function executeSponsoredSubmissionTransaction({
  digest,
  signature,
}: {
  digest: string;
  signature: string;
}): Promise<SuiTransactionBlockResponse> {
  return postJson<SuiTransactionBlockResponse>("/api/enoki/execute", { digest, signature });
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  if (!ENOKI_SPONSOR_URL) {
    throw new Error("Enoki sponsor backend is not configured.");
  }

  const response = await fetch(`${ENOKI_SPONSOR_URL.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Enoki sponsor request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}
