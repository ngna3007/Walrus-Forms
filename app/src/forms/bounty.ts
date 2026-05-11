import { Transaction } from "@mysten/sui/transactions";
import { SUI_TYPE_ARG } from "@mysten/sui/utils";

import { PACKAGE_ID, WAL_COIN_TYPE } from "@/config";

export interface SponsorBountyArgs {
  formId: string;
  amountMist: bigint | number | string;
  tokenSymbol: "SUI" | "WAL";
  coinObjectId?: string;
}

export interface ReleaseBountyArgs {
  bountyObjectId: string;
  recipient: string;
  tokenSymbol: "SUI" | "WAL";
}

export function buildSponsorBountyTx(args: SponsorBountyArgs): Transaction {
  const tx = new Transaction();
  const typeArg = coinTypeForSymbol(args.tokenSymbol);
  const payout =
    typeArg === SUI_TYPE_ARG
      ? tx.splitCoins(tx.gas, [tx.pure.u64(args.amountMist)])
      : args.coinObjectId
      ? tx.splitCoins(tx.object(args.coinObjectId), [tx.pure.u64(args.amountMist)])
      : missingWalCoin();

  tx.moveCall({
    target: `${PACKAGE_ID}::bounty::sponsor`,
    typeArguments: [typeArg],
    arguments: [tx.pure.id(args.formId), payout],
  });
  return tx;
}

function missingWalCoin(): never {
  throw new Error("WAL bounties require a WAL Coin object id for escrow funding.");
}

export function buildReleaseBountyTx(args: ReleaseBountyArgs): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::bounty::release`,
    typeArguments: [coinTypeForSymbol(args.tokenSymbol)],
    arguments: [tx.object(args.bountyObjectId), tx.pure.address(args.recipient)],
  });
  return tx;
}

function coinTypeForSymbol(symbol: "SUI" | "WAL"): string {
  return symbol === "WAL" ? WAL_COIN_TYPE : SUI_TYPE_ARG;
}

export function parseTokenAmount(amount: string, decimals = 9): bigint {
  const trimmed = amount.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) throw new Error("Amount must be a positive decimal number.");
  const [whole, fraction = ""] = trimmed.split(".");
  const padded = fraction.padEnd(decimals, "0").slice(0, decimals);
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(padded || "0");
}
