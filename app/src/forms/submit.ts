import { Transaction } from "@mysten/sui/transactions";

import { PACKAGE_ID, WALRUS_USE_SDK, WALRUS_DEFAULT_EPOCHS } from "../config";
import { encryptForForm } from "../seal/encrypt";
import { storeBlob } from "../walrus/client";
import { writeSubmissionQuilt } from "../walrus/sdk";
import type { SignAndExecute } from "../walrus/sdk";
import type { FormSchema, SubmissionPayload, SubmissionValue } from "./types";

const CLOCK_OBJECT_ID = "0x6";

export type FormPolicy =
  | { kind: "public" }
  | { kind: "allowlist"; allowlistObjectId: string; allowlistId?: string; allowlistName?: string; members?: string[]; memberRoles?: Record<string, "admin" | "reviewer"> }
  | { kind: "timelock"; unlockTimeMs: bigint }
  | { kind: "tokenGated"; gateObjectId: string };

export interface PendingFile {
  contents: Uint8Array;
  mimeType: string;
  fieldKey: string;
}

export interface SubmitArgs {
  formId: string;
  formObjectId: string;
  policy: FormPolicy;
  schema: FormSchema;
  payload: SubmissionPayload;
  /** Deferred file uploads — packed into a quilt in SDK mode, uploaded via publisher in publisher mode. */
  pendingFiles?: PendingFile[];
  createReputation?: boolean;
  signAndExecute?: SignAndExecute;
  owner?: string;
}

export interface SubmitResult {
  submissionBlobId: string;
  fileBlobIds: string[];
  /** Set in publisher mode: the caller must sign this to complete the submission. */
  txBuilder?: Transaction;
  /** Set in SDK/quilt mode: certify+submit tx already executed. */
  certifyTxResult?: unknown;
}

/**
 * Encrypt submission payload (if non-public policy), upload to Walrus,
 * then either return a Transaction for the caller to sign (publisher mode)
 * or execute the quilt certify+submit inline (SDK mode, 2 popups total).
 */
export async function buildSubmissionTx(args: SubmitArgs): Promise<SubmitResult> {
  if (!args.payload.submitter) {
    throw new Error("Submission payload must include the submitter address.");
  }

  // Reputation is no longer created at submit time.
  void args.createReputation;

  const pendingFiles = args.pendingFiles ?? [];

  // Assign stable identifiers to pending files.
  const pendingWithIds = pendingFiles.map((pf, i) => ({ ...pf, identifier: `file-${i}` }));

  // Rewrite payload: replace file_pending values with file values using identifier as blobId.
  const rewrittenValues: Record<string, SubmissionValue> = {};
  for (const [key, v] of Object.entries(args.payload.values)) {
    if (v.type === "file_pending") {
      const found = pendingWithIds.find((pf) => pf.fieldKey === key);
      rewrittenValues[key] = { type: "file", blobId: found?.identifier ?? "", mimeType: v.mimeType, encrypted: false };
    } else {
      rewrittenValues[key] = v;
    }
  }
  const rewrittenPayload: SubmissionPayload = { ...args.payload, values: rewrittenValues };
  const fileBlobIds = pendingWithIds.map((pf) => pf.identifier);

  const json = JSON.stringify(rewrittenPayload);
  const plain = new TextEncoder().encode(json);
  const blobBytes = args.policy.kind === "public" ? plain : await encrypt(args.policy, args.formId, plain);

  // --- SDK / quilt mode: pack everything into one quilt, 2 popups total ---
  if (WALRUS_USE_SDK && args.signAndExecute && args.owner) {
    const quiltResult = await writeSubmissionQuilt({
      submissionBytes: blobBytes,
      pendingFiles: pendingWithIds.map((pf) => ({
        contents: pf.contents,
        identifier: pf.identifier,
        mimeType: pf.mimeType,
      })),
      owner: args.owner,
      epochs: WALRUS_DEFAULT_EPOCHS,
      signAndExecute: args.signAndExecute,
      augmentCertifyTx: (quiltBlobId, tx) => {
        tx.moveCall({
          target: `${PACKAGE_ID}::submission::submit`,
          arguments: [
            tx.object(args.formObjectId),
            tx.pure.string(quiltBlobId),
            tx.pure.vector("string", fileBlobIds),
            tx.object(CLOCK_OBJECT_ID),
          ],
        });
      },
    });
    return {
      submissionBlobId: quiltResult.quiltBlobId,
      fileBlobIds,
      certifyTxResult: quiltResult.certifyTxResult,
    };
  }

  // --- Publisher mode: upload submission blob via HTTP, return txBuilder ---
  // Upload any pending files via publisher first.
  const uploadedFileBlobIds: string[] = [];
  for (const pf of pendingWithIds) {
    const { blobId } = await storeBlob(pf.contents);
    uploadedFileBlobIds.push(blobId);
  }

  const { blobId } = await storeBlob(blobBytes);

  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::submission::submit`,
    arguments: [
      tx.object(args.formObjectId),
      tx.pure.string(blobId),
      tx.pure.vector("string", uploadedFileBlobIds),
      tx.object(CLOCK_OBJECT_ID),
    ],
  });

  return { submissionBlobId: blobId, fileBlobIds: uploadedFileBlobIds, txBuilder: tx };
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
