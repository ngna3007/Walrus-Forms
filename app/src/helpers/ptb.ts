import type { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import { toHex } from "@mysten/sui/utils";

import { PACKAGE_ID } from "../config";

const CLOCK_OBJECT_ID = "0x6";

/** Build a PTB that calls seal_approve_allowlist(id, list, ctx). */
export async function buildAllowlistApprovePtb(
  client: SuiJsonRpcClient,
  identity: Uint8Array,
  allowlistObjectId: string,
): Promise<Uint8Array> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::seal_policies::seal_approve_allowlist`,
    arguments: [
      tx.pure.vector("u8", Array.from(identity)),
      tx.object(allowlistObjectId),
    ],
  });
  return tx.build({ client, onlyTransactionKind: true });
}

/** Build a PTB that calls seal_approve_timelock(id, clock). */
export async function buildTimelockApprovePtb(
  client: SuiJsonRpcClient,
  identity: Uint8Array,
): Promise<Uint8Array> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::seal_policies::seal_approve_timelock`,
    arguments: [
      tx.pure.vector("u8", Array.from(identity)),
      tx.object(CLOCK_OBJECT_ID),
    ],
  });
  return tx.build({ client, onlyTransactionKind: true });
}

/** Build a PTB that calls seal_approve_token_gated(id, gate, ctx). */
export async function buildTokenGatedApprovePtb(
  client: SuiJsonRpcClient,
  identity: Uint8Array,
  gateObjectId: string,
): Promise<Uint8Array> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::seal_policies::seal_approve_token_gated`,
    arguments: [
      tx.pure.vector("u8", Array.from(identity)),
      tx.object(gateObjectId),
    ],
  });
  return tx.build({ client, onlyTransactionKind: true });
}

export function debugIdentityHex(identity: Uint8Array): string {
  return toHex(identity);
}
