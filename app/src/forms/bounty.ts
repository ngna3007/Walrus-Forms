import { Transaction } from "@mysten/sui/transactions";
import { SUI_TYPE_ARG } from "@mysten/sui/utils";

import { PACKAGE_ID, WAL_COIN_TYPE } from "@/config";

export type BountyToken = "SUI" | "WAL";

export interface BountyTiersMist {
  /** Index 0 = Low, 1 = Medium, 2 = High, 3 = Critical. Each amount in coin's MIST/FROST. */
  low: bigint;
  medium: bigint;
  high: bigint;
  critical: bigint;
}

export interface SponsorBountyArgs {
  formId: string;
  /** Total escrow amount in MIST/FROST — must be >= sum(tiers) to cover at least one payout per tier. */
  amountMist: bigint;
  tiers: BountyTiersMist;
  tokenSymbol: BountyToken;
  /** Required for WAL bounties; SUI bounties auto-split from gas. */
  coinObjectId?: string;
}

export interface ReleaseBountyArgs {
  bountyObjectId: string;
  formObjectId: string;
  submissionObjectId: string;
  severity: number;
  tokenSymbol: BountyToken;
}

export interface DirectPayoutArgs {
  recipient: string;
  amountMist: bigint;
  tokenSymbol: BountyToken;
  /** Required for WAL payouts; SUI payouts auto-split from gas. */
  walCoinObjectId?: string;
}

/**
 * Fund-at-resolve payout. Author signs at resolve time:
 *   - SUI: split from gas, transfer to submitter
 *   - WAL: split from a wallet-owned WAL Coin, transfer to submitter
 * Skips entirely when amount is 0.
 */
export function appendBountyPayout(tx: Transaction, args: DirectPayoutArgs): void {
  if (args.amountMist <= 0n) return;
  const typeArg = coinTypeForSymbol(args.tokenSymbol);
  const source =
    typeArg === SUI_TYPE_ARG
      ? tx.gas
      : args.walCoinObjectId
        ? tx.object(args.walCoinObjectId)
        : missingWalCoin();
  const [coin] = tx.splitCoins(source, [tx.pure.u64(args.amountMist)]);
  tx.transferObjects([coin], tx.pure.address(args.recipient));
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
    arguments: [
      tx.pure.id(args.formId),
      payout,
      tx.pure.vector("u64", [
        args.tiers.low,
        args.tiers.medium,
        args.tiers.high,
        args.tiers.critical,
      ]),
    ],
  });
  return tx;
}

export function appendReleaseBounty(tx: Transaction, args: ReleaseBountyArgs): void {
  tx.moveCall({
    target: `${PACKAGE_ID}::bounty::release`,
    typeArguments: [coinTypeForSymbol(args.tokenSymbol)],
    arguments: [
      tx.object(args.bountyObjectId),
      tx.object(args.formObjectId),
      tx.object(args.submissionObjectId),
      tx.pure.u8(args.severity & 0xff),
    ],
  });
}

export function buildReleaseBountyTx(args: ReleaseBountyArgs): Transaction {
  const tx = new Transaction();
  appendReleaseBounty(tx, args);
  return tx;
}

function missingWalCoin(): never {
  throw new Error("WAL bounties require a WAL Coin object id for escrow funding.");
}

function coinTypeForSymbol(symbol: BountyToken): string {
  return symbol === "WAL" ? WAL_COIN_TYPE : SUI_TYPE_ARG;
}

export function parseTokenAmount(amount: string, decimals = 9): bigint {
  const trimmed = amount.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) throw new Error("Amount must be a positive decimal number.");
  const [whole, fraction = ""] = trimmed.split(".");
  const padded = fraction.padEnd(decimals, "0").slice(0, decimals);
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(padded || "0");
}

export function tiersFromStrings(tiers: [string, string, string, string]): BountyTiersMist {
  return {
    low: parseTokenAmount(tiers[0]),
    medium: parseTokenAmount(tiers[1]),
    high: parseTokenAmount(tiers[2]),
    critical: parseTokenAmount(tiers[3]),
  };
}

export function tierAmountForSeverity(tiers: BountyTiersMist, severity: number): bigint {
  switch (severity) {
    case 0:
      return tiers.low;
    case 1:
      return tiers.medium;
    case 2:
      return tiers.high;
    case 3:
      return tiers.critical;
    default:
      return 0n;
  }
}
