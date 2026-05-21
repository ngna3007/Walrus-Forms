import {
  NETWORK,
  WALRUS_DEFAULT_EPOCHS,
  WALRUS_PUBLISHER_URL,
  WALRUS_USE_SDK,
} from "../config";
import { readBlobViaSdk, writeFilesWithWallet, type AugmentCertifyTx, type SignAndExecute } from "./sdk";

export type StoreResult = {
  blobId: string;
  suiObjectId?: string;
  endEpoch?: number;
  startEpoch?: number;
  /** Certify tx result when using SDK mode with augmentCertifyTx. */
  certifyTxResult?: unknown;
};

export interface StoreOptions {
  epochs?: number;
  signAndExecute?: SignAndExecute;
  owner?: string;
  identifier?: string;
  augmentCertifyTx?: AugmentCertifyTx;
}

// ---------------------------------------------------------------------------
// Aggregator pool — try each in order, first success wins.
// Blobs are content-addressed so any aggregator returns identical bytes.
// ---------------------------------------------------------------------------

const TESTNET_AGGREGATORS = [
  "https://aggregator.walrus-testnet.walrus.space",
  "https://wal-aggregator-testnet.staketab.org",
  "https://walrus-testnet-aggregator.nodes.guru",
];
const MAINNET_AGGREGATORS = [
  "https://aggregator.walrus.space",
  "https://wal-aggregator-mainnet.staketab.org",
];

function aggregators(): string[] {
  return NETWORK === "mainnet" ? MAINNET_AGGREGATORS : TESTNET_AGGREGATORS;
}

// ---------------------------------------------------------------------------
// localStorage read cache — blobs are immutable (content-addressed), cached forever.
// ---------------------------------------------------------------------------

const CACHE_PREFIX = "wf:v1:";

function fromCache(blobId: string): Uint8Array | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + blobId);
    if (!raw) return null;
    const bin = atob(raw);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function toCache(blobId: string, bytes: Uint8Array): void {
  try {
    let s = "";
    for (const b of bytes) s += String.fromCharCode(b);
    localStorage.setItem(CACHE_PREFIX + blobId, btoa(s));
  } catch {
    // Quota exceeded — evict old wf: entries then retry once.
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k?.startsWith(CACHE_PREFIX)) localStorage.removeItem(k);
      }
      let s = "";
      for (const b of bytes) s += String.fromCharCode(b);
      localStorage.setItem(CACHE_PREFIX + blobId, btoa(s));
    } catch {
      // give up
    }
  }
}

/**
 * Upload bytes to Walrus.
 *
 * Two paths:
 *   - SDK + wallet (`WALRUS_USE_SDK=true`): user pays their own storage via wallet.
 *   - Publisher HTTP (default): publisher pays; no wallet popups.
 */
export async function storeBlob(data: Uint8Array, opts: StoreOptions = {}): Promise<StoreResult> {
  const epochs = opts.epochs ?? WALRUS_DEFAULT_EPOCHS;

  if (WALRUS_USE_SDK) {
    if (!opts.signAndExecute || !opts.owner) {
      throw new Error("storeBlob: signAndExecute + owner required when WALRUS_USE_SDK is true");
    }
    const [file] = await writeFilesWithWallet({
      files: [{ contents: data, identifier: opts.identifier ?? "blob" }],
      owner: opts.owner,
      epochs,
      signAndExecute: opts.signAndExecute,
      augmentCertifyTx: opts.augmentCertifyTx,
    });
    return { blobId: file.blobId, suiObjectId: file.objectId, certifyTxResult: file.certifyTxResult };
  }

  return storeBlobViaPublisher(data, epochs);
}

async function storeBlobViaPublisher(data: Uint8Array, epochs: number): Promise<StoreResult> {
  const url = `${WALRUS_PUBLISHER_URL}/v1/blobs?epochs=${epochs}`;
  const body = new Blob([data as BlobPart], { type: "application/octet-stream" });
  const resp = await fetch(url, {
    method: "PUT",
    body,
    headers: { "Content-Type": "application/octet-stream" },
  });

  if (!resp.ok) {
    throw new Error(`Walrus publisher ${resp.status}: ${await resp.text()}`);
  }

  const json = await resp.json();
  if (json.newlyCreated) {
    return {
      blobId: json.newlyCreated.blobObject.blobId,
      suiObjectId: json.newlyCreated.blobObject.id,
      startEpoch: json.newlyCreated.blobObject.storage?.startEpoch,
      endEpoch: json.newlyCreated.blobObject.storage?.endEpoch,
    };
  }
  if (json.alreadyCertified) {
    return {
      blobId: json.alreadyCertified.blobId,
      endEpoch: json.alreadyCertified.endEpoch,
    };
  }
  throw new Error(`Walrus publisher returned unexpected payload: ${JSON.stringify(json)}`);
}

/**
 * Read raw blob bytes.
 *
 * Order: localStorage cache → aggregator pool (tries each in turn) → SDK WASM fallback.
 * Cache hit = instant. Aggregator hit = ~200ms. SDK fallback = ~5-10s cold start.
 */
export async function readBlob(blobId: string): Promise<Uint8Array> {
  const cached = fromCache(blobId);
  if (cached) return cached;

  let lastErr: unknown = null;
  for (const base of aggregators()) {
    try {
      const resp = await fetch(`${base}/v1/blobs/${blobId}`);
      if (resp.ok) {
        const bytes = new Uint8Array(await resp.arrayBuffer());
        toCache(blobId, bytes);
        return bytes;
      }
      lastErr = new Error(`${base} HTTP ${resp.status}`);
    } catch (e) {
      lastErr = e;
    }
  }

  // WASM SDK fallback — slow but reliable.
  try {
    const bytes = await readBlobViaSdk(blobId);
    toCache(blobId, bytes);
    return bytes;
  } catch (e) {
    throw new Error(
      `All aggregators failed for ${blobId}: ${
        lastErr instanceof Error ? lastErr.message : String(lastErr)
      }. SDK: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

/**
 * Read a named entry from a quilt blob via aggregator HTTP.
 * Used for submissions stored as quilts (submission JSON + file attachments).
 */
export async function readQuiltEntry(quiltBlobId: string, identifier: string): Promise<Uint8Array> {
  let lastErr: unknown = null;
  for (const base of aggregators()) {
    try {
      const resp = await fetch(`${base}/v1/blobs/by-quilt-id/${quiltBlobId}/${encodeURIComponent(identifier)}`);
      if (resp.ok) {
        return new Uint8Array(await resp.arrayBuffer());
      }
      lastErr = new Error(`${base} HTTP ${resp.status}`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(
    `readQuiltEntry ${quiltBlobId}/${identifier}: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
  );
}

export async function readJson<T>(blobId: string): Promise<T> {
  const bytes = await readBlob(blobId);
  const text = new TextDecoder().decode(bytes);
  try {
    return JSON.parse(text) as T;
  } catch (jsonErr) {
    // Blob may be a quilt (binary format) — try the "submission" named entry.
    try {
      const subBytes = await readQuiltEntry(blobId, "submission");
      return JSON.parse(new TextDecoder().decode(subBytes)) as T;
    } catch (quiltErr) {
      throw new Error(
        `readJson failed for ${blobId}: JSON parse: ${jsonErr instanceof Error ? jsonErr.message : String(jsonErr)}; quilt: ${quiltErr instanceof Error ? quiltErr.message : String(quiltErr)}`,
      );
    }
  }
}
