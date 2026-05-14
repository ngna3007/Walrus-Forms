import { Transaction } from "@mysten/sui/transactions";

import { PACKAGE_ID } from "@/config";

const CLOCK_OBJECT_ID = "0x6";

/**
 * Form owner mints a soulbound `SubmissionReceipt` to the submitter.
 *
 * The new design replaces the per-submitter shared `SubmitterReputation` object
 * with a per-resolution soulbound NFT (`key`-only, no `store`). Each resolved
 * submission produces one receipt, owned by the submitter's address forever.
 * Cross-dApp reputation = aggregate over the submitter's receipts.
 *
 * Severity is the same 0..3 tier used by the bounty module:
 *   0 = Low / 1 = Medium / 2 = High / 3 = Critical
 *
 * The Move side rejects the call if `submission.submitter == form.owner` so
 * owners can preview-submit their own form without polluting their reputation.
 */
export function appendMintReceipt(
  tx: Transaction,
  args: { formObjectId: string; submissionObjectId: string; severity: number },
): void {
  tx.moveCall({
    target: `${PACKAGE_ID}::reputation::mint_receipt`,
    arguments: [
      tx.object(args.formObjectId),
      tx.object(args.submissionObjectId),
      tx.pure.u8(args.severity & 0xff),
      tx.object(CLOCK_OBJECT_ID),
    ],
  });
}

export function buildMintReceiptTx(args: {
  formObjectId: string;
  submissionObjectId: string;
  severity: number;
}): Transaction {
  const tx = new Transaction();
  appendMintReceipt(tx, args);
  return tx;
}
