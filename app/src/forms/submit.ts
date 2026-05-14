import { Transaction } from "@mysten/sui/transactions";

import { PACKAGE_ID } from "../config";
import { encryptForForm } from "../seal/encrypt";
import { storeBlob } from "../walrus/client";
import type { FormSchema, SubmissionPayload } from "./types";

const CLOCK_OBJECT_ID = "0x6";

export type FormPolicy =
  | { kind: "public" }
  | { kind: "allowlist"; allowlistObjectId: string; allowlistId?: string; allowlistName?: string; members?: string[] }
  | { kind: "timelock"; unlockTimeMs: bigint }
  | { kind: "tokenGated"; gateObjectId: string };

export interface SubmitArgs {
  formId: string;
  formObjectId: string;
  policy: FormPolicy;
  schema: FormSchema;
  payload: SubmissionPayload;
  fileBlobIds?: string[];
  createReputation?: boolean;
}

export interface SubmitResult {
  submissionBlobId: string;
  txBuilder: Transaction;
}

/**
 * Encrypt submission payload (if non-public policy), upload to Walrus,
 * then return a Transaction for the caller's wallet to sign + execute.
 */
export async function buildSubmissionTx(args: SubmitArgs): Promise<SubmitResult> {
  if (!args.payload.submitter) {
    throw new Error("Submission payload must include the submitter address.");
  }

  const json = JSON.stringify(args.payload);
  const plain = new TextEncoder().encode(json);

  let blobBytes: Uint8Array;
  if (args.policy.kind === "public") {
    blobBytes = plain;
  } else {
    const encrypted = await encrypt(args.policy, args.formId, plain);
    blobBytes = encrypted;
  }

  const { blobId } = await storeBlob(blobBytes);

  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::submission::submit`,
    arguments: [
      tx.object(args.formObjectId),
      tx.pure.string(blobId),
      tx.pure.vector("string", args.fileBlobIds ?? []),
      tx.object(CLOCK_OBJECT_ID),
    ],
  });
  // Reputation is no longer created at submit time. The new design mints a
  // soulbound `SubmissionReceipt` to the submitter when the form owner resolves
  // the submission. See `reputation::mint_receipt` and the Drawer's
  // `mintReceiptAndPayout` flow in `pages/AdminPage.tsx`. The `createReputation`
  // arg is kept for backwards-compat with older callers and is a no-op.
  void args.createReputation;

  return { submissionBlobId: blobId, txBuilder: tx };
}

async function encrypt(policy: FormPolicy, formId: string, data: Uint8Array): Promise<Uint8Array> {
  switch (policy.kind) {
    case "allowlist": {
      const { ciphertext } = await encryptForForm({
        kind: "allowlist",
        allowlistObjectId: policy.allowlistObjectId,
        formId,
        data,
      });
      return ciphertext;
    }
    case "timelock": {
      const { ciphertext } = await encryptForForm({
        kind: "timelock",
        unlockTimeMs: policy.unlockTimeMs,
        formId,
        data,
      });
      return ciphertext;
    }
    case "tokenGated": {
      const { ciphertext } = await encryptForForm({
        kind: "tokenGated",
        gateObjectId: policy.gateObjectId,
        formId,
        data,
      });
      return ciphertext;
    }
    case "public":
      return data;
  }
}
