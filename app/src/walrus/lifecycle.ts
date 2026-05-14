/**
 * Walrus blob lifecycle helpers.
 *
 * Background (per Walrus docs):
 *   - Each `Blob` Sui object owns a `Storage` reservation with `start_epoch` and
 *     `end_epoch`. The blob becomes unavailable at the *start* of `end_epoch`.
 *   - Testnet epoch = 1 day, Mainnet epoch = 14 days.
 *   - Max storage period: 53 epochs (~2 years).
 *   - Owner can extend before the blob expires via
 *     `client.walrus.extendBlobTransaction({ blobObjectId, epochs })`.
 *
 * This module reads epoch state from on-chain objects and builds the extend tx.
 */

import type { Transaction } from "@mysten/sui/transactions";

import { getWalrusSdkClient } from "./sdk";

/** Minimal Sui client surface this module needs. dApp Kit's `useSuiClient` returns this. */
interface ReadClient {
  getObject: (args: { id: string; options?: { showContent?: boolean } }) => Promise<{
    data?: { content?: { dataType: string; fields?: unknown } | null } | null;
  }>;
}

export interface BlobLifecycle {
  blobObjectId: string;
  blobId: string;
  startEpoch: number;
  endEpoch: number;
  certifiedEpoch: number | null;
  deletable: boolean;
}

export interface LifecycleSummary {
  blob: BlobLifecycle;
  currentEpoch: number;
  /** Epochs remaining until the blob becomes unavailable. Negative if already expired. */
  epochsRemaining: number;
  expired: boolean;
}

/**
 * Read the Walrus `Blob` object on Sui to recover its storage window.
 *
 * Argument should be the `suiObjectId` returned by `storeBlob` (the Blob NFT id),
 * NOT the content-addressed `blobId` string.
 */
export async function readBlobLifecycle(
  client: ReadClient,
  blobObjectId: string,
): Promise<BlobLifecycle | null> {
  const response = await client.getObject({
    id: blobObjectId,
    options: { showContent: true },
  });
  const content = response.data?.content;
  if (!content || content.dataType !== "moveObject") return null;
  const fields = (content.fields ?? {}) as Record<string, unknown>;
  const storageField = fields.storage as { fields?: Record<string, unknown> } | undefined;
  const storage = storageField?.fields ?? {};
  return {
    blobObjectId,
    blobId: String(fields.blob_id ?? ""),
    startEpoch: Number(storage.start_epoch ?? 0),
    endEpoch: Number(storage.end_epoch ?? 0),
    certifiedEpoch: fields.certified_epoch == null ? null : Number(fields.certified_epoch),
    deletable: Boolean(fields.deletable),
  };
}

/** Current Walrus committee epoch via the Walrus system state. */
export async function readCurrentEpoch(): Promise<number> {
  const client = getWalrusSdkClient();
  const state = await client.walrus.systemState();
  return Number(state.committee.epoch ?? 0);
}

export async function summarizeLifecycle(
  client: ReadClient,
  blobObjectId: string,
): Promise<LifecycleSummary | null> {
  const [blob, currentEpoch] = await Promise.all([
    readBlobLifecycle(client, blobObjectId),
    readCurrentEpoch().catch(() => 0),
  ]);
  if (!blob) return null;
  const epochsRemaining = blob.endEpoch - currentEpoch;
  return {
    blob,
    currentEpoch,
    epochsRemaining,
    expired: epochsRemaining <= 0,
  };
}

/**
 * Build a Transaction that extends the blob's storage by `epochs` more epochs.
 *
 * Caller signs via dApp Kit's `useSignAndExecuteTransaction`. Blob owner only.
 *
 * Optionally accepts a pre-built `transaction` (so callers can splice a SUI→WAL
 * swap into the same tx) and a `walCoin` argument from that swap.
 */
export async function buildExtendBlobTx(
  blobObjectId: string,
  epochs: number,
  options?: {
    walCoin?: import("@mysten/sui/transactions").TransactionObjectArgument;
    transaction?: Transaction;
  },
): Promise<Transaction> {
  if (!Number.isFinite(epochs) || epochs <= 0) {
    throw new Error("Extend epochs must be a positive integer.");
  }
  const client = getWalrusSdkClient();
  return client.walrus.extendBlobTransaction({
    blobObjectId,
    epochs,
    walCoin: options?.walCoin,
    transaction: options?.transaction,
  });
}

/**
 * Approximate ms-per-epoch by network. Testnet = 1 day, Mainnet = 14 days.
 * Used only for human-friendly "expires in 3d 4h" labels — not for any policy decision.
 */
export function approxEpochDurationMs(network: "testnet" | "mainnet"): number {
  return network === "mainnet" ? 14 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
}

export function formatEpochsRemaining(remaining: number, network: "testnet" | "mainnet"): string {
  if (remaining <= 0) return "expired";
  const ms = remaining * approxEpochDurationMs(network);
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (network === "mainnet") {
    if (days >= 14) {
      const weeks = Math.floor(days / 7);
      return `${remaining} epoch${remaining === 1 ? "" : "s"} · ~${weeks}w`;
    }
    return `${remaining} epoch${remaining === 1 ? "" : "s"} · ~${days}d`;
  }
  return `${remaining} epoch${remaining === 1 ? "" : "s"} · ~${days}d`;
}
