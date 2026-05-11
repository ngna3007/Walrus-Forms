/**
 * Runtime config. Set these in `app/.env.local`; see `app/.env.example`.
 */

export const NETWORK = envString("VITE_SUI_NETWORK", "testnet") as
  | "testnet"
  | "mainnet";

export const FULLNODE_URL = envString(
  "VITE_FULLNODE_URL",
  "https://fullnode.testnet.sui.io:443",
);

export const WALRUS_PUBLISHER_URL = envString(
  "VITE_WALRUS_PUBLISHER_URL",
  "https://publisher.walrus-testnet.walrus.space",
);
export const WALRUS_AGGREGATOR_URL = envString(
  "VITE_WALRUS_AGGREGATOR_URL",
  "https://aggregator.walrus-testnet.walrus.space",
);

/** Set after `sui client publish`. */
export const PACKAGE_ID = envString("VITE_PACKAGE_ID", "0x0");

export const PACKAGE_CONFIGURED = /^0x[0-9a-fA-F]{64}$/.test(PACKAGE_ID);

/** Testnet WAL coin type for sponsored bounty escrows. */
export const WAL_COIN_TYPE = envString(
  "VITE_WAL_COIN_TYPE",
  "0x8270feb7375eee355e64fdb69c50abb6b5f9393a722883c1cf45f8e26048810a::wal::WAL",
);

/** Threshold of Seal key servers required for decryption. */
export const SEAL_THRESHOLD = envNumber("VITE_SEAL_THRESHOLD", 2);

/** Verified testnet Seal key servers. */
export const SEAL_KEY_SERVERS: string[] = [
  "0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75",
  "0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8",
];

export const SESSION_KEY_TTL_MIN = envNumber("VITE_SESSION_KEY_TTL_MIN", 10);

/** Walrus blob storage epochs (1 epoch = 1 day on testnet). */
export const WALRUS_DEFAULT_EPOCHS = envNumber("VITE_WALRUS_DEFAULT_EPOCHS", 5);

/**
 * Use the `@mysten/walrus` TS SDK for uploads (true) or the publisher HTTP API (false).
 *
 * SDK mode: user signs `register` and `certify` transactions with their own wallet,
 *   pays their own WAL for storage. Stack-native, but adds wallet popups.
 * Publisher mode: publisher signs and pays. Single HTTP PUT, fastest to demo.
 */
export const WALRUS_USE_SDK = envBool("VITE_WALRUS_USE_SDK", false);

function envString(key: string, fallback: string): string {
  return import.meta.env[key] || fallback;
}

function envNumber(key: string, fallback: number): number {
  const value = Number(import.meta.env[key]);
  return Number.isFinite(value) ? value : fallback;
}

function envBool(key: string, fallback: boolean): boolean {
  const value = import.meta.env[key];
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}
