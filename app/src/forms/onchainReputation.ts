import { Transaction } from "@mysten/sui/transactions";

import { PACKAGE_ID } from "@/config";

export function buildCreateReputationTx(submitter: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::reputation::create`,
    arguments: [tx.pure.address(submitter)],
  });
  return tx;
}

export function buildRecordSubmissionTx(reputationObjectId: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::reputation::record_submission`,
    arguments: [tx.object(reputationObjectId)],
  });
  return tx;
}

export function buildRecordResolutionTx(reputationObjectId: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::reputation::record_resolution`,
    arguments: [tx.object(reputationObjectId)],
  });
  return tx;
}
