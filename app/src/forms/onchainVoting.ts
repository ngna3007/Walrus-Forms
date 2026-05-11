import { Transaction } from "@mysten/sui/transactions";

import { PACKAGE_ID } from "@/config";

export function buildCreateVotingBoardTx(formId: string, quadratic: boolean): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::voting::create_board`,
    arguments: [tx.pure.id(formId), tx.pure.bool(quadratic)],
  });
  return tx;
}

export function buildCastRoadmapVoteTx(votingObjectId: string, submissionId: string, votes: number): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::voting::vote`,
    arguments: [
      tx.object(votingObjectId),
      tx.pure.id(submissionId),
      tx.pure.u64(votes),
    ],
  });
  return tx;
}
