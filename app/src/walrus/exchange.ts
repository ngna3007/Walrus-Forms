/**
 * SUI ↔ WAL native exchange helpers.
 *
 * Walrus storage and extend operations cost WAL. Users frequently arrive with
 * only SUI in their wallet, so this module lets us splice a
 * `wal_exchange::exchange_all_for_wal` call into any Transaction.
 */

import { coinWithBalance, type Transaction, type TransactionObjectArgument } from "@mysten/sui/transactions";
import { parseStructTag } from "@mysten/sui/utils";
import { TESTNET_WALRUS_PACKAGE_CONFIG } from "@mysten/walrus";

import { NETWORK, WAL_COIN_TYPE } from "@/config";

export interface ExchangeConfig {
  exchangeObjectId: string;
  exchangePackageId: string;
}

export interface ExchangeRate {
  /** Raw SUI component from the protocol rate ratio. */
  rateSui: bigint;
  /** Raw WAL component from the protocol rate ratio. */
  rateWal: bigint;
}

// Structural-only client interface so this module works with both
// `SuiJsonRpcClient` and `SuiGrpcClient` (which return slightly different
// nullable shapes for `content`).
interface ReadClient {
  getObject: (params: { id: string; options?: { showType?: boolean; showContent?: boolean } }) => Promise<unknown>;
  getBalance?: (params: { owner: string; coinType?: string }) => Promise<{ totalBalance: string }>;
}

function pickContentFields(response: unknown): Record<string, unknown> | null {
  const data = (response as { data?: unknown })?.data as
    | { content?: unknown }
    | null
    | undefined;
  const content = data?.content as { dataType?: string; fields?: unknown } | null | undefined;
  if (!content || content.dataType !== "moveObject") return null;
  return (content.fields ?? {}) as Record<string, unknown>;
}

function pickObjectType(response: unknown): string | null {
  const data = (response as { data?: { type?: unknown } | null })?.data;
  const type = data?.type;
  return typeof type === "string" ? type : null;
}

let cachedConfig: ExchangeConfig | null = null;
let cachedConfigNetwork: string | null = null;

/** Pool ids for the current network. Mainnet has no native exchange pool yet. */
function getExchangeIds(): string[] {
  if (NETWORK === "testnet") return TESTNET_WALRUS_PACKAGE_CONFIG.exchangeIds;
  return [];
}

export function exchangeAvailable(): boolean {
  return getExchangeIds().length > 0;
}

/**
 * Resolve the exchange config by reading the first exchange object from
 * the network's package config and extracting the package id from its type tag.
 */
export async function resolveExchangeConfig(client: ReadClient): Promise<ExchangeConfig> {
  if (cachedConfig && cachedConfigNetwork === NETWORK) return cachedConfig;

  const exchangeIds = getExchangeIds();
  if (exchangeIds.length === 0) {
    throw new Error(`Native SUI→WAL exchange pool is not configured for ${NETWORK}.`);
  }

  const exchangeObjectId = exchangeIds[0];
  const obj = await client.getObject({
    id: exchangeObjectId,
    options: { showType: true },
  });

  const objectType = pickObjectType(obj);
  if (!objectType) {
    throw new Error(`Could not read type for exchange object ${exchangeObjectId}.`);
  }

  const parsed = parseStructTag(objectType);
  const exchangePackageId = parsed.address;

  cachedConfig = { exchangeObjectId, exchangePackageId };
  cachedConfigNetwork = NETWORK;
  return cachedConfig;
}

/**
 * Fetch the current SUI/WAL exchange rate from an exchange pool object.
 *
 * On-chain layout (`wal_exchange::Exchange`):
 *   - rate: ExchangeRate { sui: u64, wal: u64 }  // fixed protocol rate
 *   - sui: u64                                    // SUI liquidity in pool
 *   - wal: u64                                    // WAL liquidity in pool
 */
export async function fetchExchangeRate(
  client: ReadClient,
  exchangeObjectId: string,
): Promise<ExchangeRate> {
  const obj = await client.getObject({
    id: exchangeObjectId,
    options: { showContent: true },
  });

  const rawFields = pickContentFields(obj);
  if (!rawFields) {
    throw new Error("Could not read exchange object fields.");
  }
  const fields = rawFields as {
    rate?: { fields?: { sui?: unknown; wal?: unknown } };
    sui?: unknown;
    wal?: unknown;
  };

  const rateFields = fields.rate?.fields;
  const rateSui = BigInt(String(rateFields?.sui ?? "0"));
  const rateWal = BigInt(String(rateFields?.wal ?? "0"));

  if (rateSui === 0n || rateWal === 0n) {
    throw new Error("Exchange rate is zero.");
  }

  const poolWal = BigInt(String(fields.wal ?? "0"));
  if (poolWal === 0n) {
    throw new Error("Exchange pool has zero WAL liquidity.");
  }

  return { rateSui, rateWal };
}

/**
 * Estimate SUI MIST needed to obtain `walMist` WAL.
 *
 * The native exchange uses a fixed protocol rate (not an AMM), so slippage is
 * unnecessary. The `+ 1n` covers integer rounding in the on-chain division.
 */
export function estimateSuiForWal(walMist: bigint, rate: ExchangeRate): bigint {
  if (walMist <= 0n) return 0n;
  return (walMist * rate.rateSui) / rate.rateWal + 1n;
}

export type SuiSource =
  /** Explicit coin object ids. Compatible with Enoki sponsorship (gas separate). */
  | { mode: "coins"; coinObjectIds: string[] }
  /** Split from tx.gas. Wallet-compatible, no coin/gas overlap. */
  | { mode: "gas" }
  /**
   * coinWithBalance — pulls from the address balance abstraction.
   *
   * Only safe when funds-in-address-balance ≥ suiMist; otherwise this will
   * fail at runtime. See:
   * https://docs.sui.io/guides/developer/digital-assets/migrate-address-balances
   */
  | { mode: "addressBalance"; useGasCoin?: boolean };

/**
 * Add a SUI → WAL swap to an existing Transaction and return the resulting
 * WAL coin so the caller can spend it (extend, register, etc.).
 *
 * Calls `wal_exchange::exchange_all_for_wal(exchange_obj, Coin<SUI>) → Coin<WAL>`.
 */
export function addSuiToWalSwap(
  tx: Transaction,
  suiMist: bigint,
  config: ExchangeConfig,
  source: SuiSource = { mode: "gas" },
): TransactionObjectArgument {
  let suiCoin: TransactionObjectArgument;

  switch (source.mode) {
    case "coins": {
      const { coinObjectIds } = source;
      if (coinObjectIds.length === 0) {
        throw new Error("No SUI coin objects provided for swap.");
      }
      const [primaryId, ...restIds] = coinObjectIds;
      const primary = tx.object(primaryId);
      if (restIds.length > 0) {
        tx.mergeCoins(
          primary,
          restIds.map((id) => tx.object(id)),
        );
      }
      [suiCoin] = tx.splitCoins(primary, [tx.pure.u64(suiMist)]);
      break;
    }
    case "gas": {
      [suiCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(suiMist)]);
      break;
    }
    case "addressBalance": {
      suiCoin = tx.add(
        coinWithBalance({
          balance: suiMist,
          useGasCoin: source.useGasCoin ?? true,
        }),
      );
      break;
    }
  }

  const [walCoin] = tx.moveCall({
    target: `${config.exchangePackageId}::wal_exchange::exchange_all_for_wal`,
    arguments: [tx.object(config.exchangeObjectId), suiCoin],
  });
  return walCoin;
}

/**
 * Read a wallet's WAL balance (FROST units). Returns `0n` if RPC unavailable.
 */
export async function getWalBalance(client: ReadClient, owner: string): Promise<bigint> {
  if (!client.getBalance) return 0n;
  try {
    const balance = await client.getBalance({ owner, coinType: WAL_COIN_TYPE });
    return BigInt(balance.totalBalance);
  } catch {
    return 0n;
  }
}

/**
 * Read a wallet's SUI balance (MIST units). Returns `0n` if RPC unavailable.
 */
export async function getSuiBalance(client: ReadClient, owner: string): Promise<bigint> {
  if (!client.getBalance) return 0n;
  try {
    const balance = await client.getBalance({ owner });
    return BigInt(balance.totalBalance);
  } catch {
    return 0n;
  }
}

/**
 * High-level helper: if the caller is short on WAL, splice a SUI→WAL swap into
 * the supplied Transaction. Returns the WAL `Coin` object id for downstream
 * `walCoin?:` arguments (e.g. `extendBlobTransaction`). Otherwise returns null
 * and the caller proceeds with the WAL it already has.
 *
 * `targetWalFrost` = WAL amount needed. Caller should round up slightly to cover
 * fluctuation.
 */
export async function ensureWalSwap(
  client: ReadClient,
  owner: string,
  targetWalFrost: bigint,
  tx: Transaction,
): Promise<{ walCoin: TransactionObjectArgument | null; suiMistConsumed: bigint }> {
  if (!exchangeAvailable()) {
    return { walCoin: null, suiMistConsumed: 0n };
  }
  const walBalance = await getWalBalance(client, owner);
  if (walBalance >= targetWalFrost) {
    return { walCoin: null, suiMistConsumed: 0n };
  }

  const shortfall = targetWalFrost - walBalance;
  const config = await resolveExchangeConfig(client);
  const rate = await fetchExchangeRate(client, config.exchangeObjectId);
  // Add a small headroom on the shortfall so rounding never under-funds.
  const wantWal = shortfall + shortfall / 100n + 1n;
  const suiNeeded = estimateSuiForWal(wantWal, rate);
  const walCoin = addSuiToWalSwap(tx, suiNeeded, config, { mode: "gas" });
  return { walCoin, suiMistConsumed: suiNeeded };
}
