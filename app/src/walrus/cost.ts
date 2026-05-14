/**
 * Walrus storage cost estimation.
 *
 * Wraps `WalrusClient.storageCost(size, epochs)` from `@mysten/walrus` and adds
 * formatting helpers. Returns FROST + a human WAL string. Per Walrus docs:
 *   - 1 WAL = 1_000_000_000 FROST
 *   - Cost = encoded_size * storage_price_per_unit * epochs + write_fee
 *   - Storage unit is 1 MiB; small blobs are dominated by per-blob metadata (~64 MB)
 *   - SUI gas for register + certify is separate and roughly fixed per blob
 *
 * Reference:
 *   https://docs.wal.app/docs/system-overview/storage-costs
 *   https://github.com/MystenLabs/sui-move-bootcamp/blob/main/C2/walrus/practice/ts/src/estimate.ts
 */

import { getWalrusSdkClient } from "./sdk";

export interface StorageCostBreakdown {
  /** WAL paid for the encoded-size-times-epochs storage reservation. */
  storageFrost: bigint;
  /** WAL paid as the per-blob register/write fee. Independent of epochs. */
  writeFrost: bigint;
  /** Sum of storage + write. */
  totalFrost: bigint;
  /** Size used in the calculation, in bytes. */
  sizeBytes: number;
  /** Epoch count used in the calculation. */
  epochs: number;
}

export async function estimateStorageCost(
  sizeBytes: number,
  epochs: number,
): Promise<StorageCostBreakdown> {
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) {
    throw new Error("Size must be a non-negative number of bytes.");
  }
  if (!Number.isInteger(epochs) || epochs <= 0 || epochs > 53) {
    throw new Error("Epochs must be an integer between 1 and 53.");
  }

  const client = getWalrusSdkClient();
  const { storageCost, writeCost, totalCost } = await client.walrus.storageCost(
    Math.max(1, Math.floor(sizeBytes)),
    epochs,
  );
  return {
    storageFrost: BigInt(storageCost),
    writeFrost: BigInt(writeCost),
    totalFrost: BigInt(totalCost),
    sizeBytes,
    epochs,
  };
}

export const FROST_PER_WAL = 1_000_000_000n;

/** Convert FROST → WAL number (lossy for display). */
export function frostToWal(frost: bigint): number {
  // Use string conversion to avoid Number precision loss on > 2^53 FROST.
  // For UI we only need ~6 decimal places.
  const whole = frost / FROST_PER_WAL;
  const remainder = frost % FROST_PER_WAL;
  const fraction = Number(remainder) / Number(FROST_PER_WAL);
  return Number(whole) + fraction;
}

export function formatWal(frost: bigint, opts: { digits?: number } = {}): string {
  const wal = frostToWal(frost);
  const digits = opts.digits ?? (wal >= 1 ? 4 : 6);
  return `${wal.toFixed(digits)} WAL`;
}

export function formatFrost(frost: bigint): string {
  return `${frost.toLocaleString()} FROST`;
}
