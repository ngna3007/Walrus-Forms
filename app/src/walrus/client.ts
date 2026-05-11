import {
  WALRUS_AGGREGATOR_URL,
  WALRUS_DEFAULT_EPOCHS,
  WALRUS_PUBLISHER_URL,
  WALRUS_USE_SDK,
} from "../config";
import { readBlobViaSdk, writeFilesWithWallet, type SignAndExecute } from "./sdk";

export type StoreResult = {
  blobId: string;
  suiObjectId?: string;
  endEpoch?: number;
};

export interface StoreOptions {
  epochs?: number;
  /** Required when WALRUS_USE_SDK is true. Pass through from `useSignAndExecuteTransaction`. */
  signAndExecute?: SignAndExecute;
  /** Owner address; required when WALRUS_USE_SDK is true. */
  owner?: string;
  /** Optional human-readable identifier when using the SDK / WalrusFile path. */
  identifier?: string;
}

/**
 * Upload bytes to Walrus.
 *
 * Two paths:
 *   - SDK + wallet (`WALRUS_USE_SDK=true`): user pays their own storage via wallet.
 *     Uses `writeFilesFlow` (`register` + `certify` wallet popups).
 *   - Publisher HTTP (default): publisher pays for storage; faster to demo, no wallet popups.
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
    });
    return { blobId: file.blobId, suiObjectId: file.objectId };
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
 * Read raw blob bytes. Defaults to the aggregator (fast, ~1 request) and falls back to
 * the SDK reader on failure.
 */
export async function readBlob(blobId: string): Promise<Uint8Array> {
  const url = `${WALRUS_AGGREGATOR_URL}/v1/blobs/${blobId}`;
  try {
    const resp = await fetch(url);
    if (resp.ok) {
      return new Uint8Array(await resp.arrayBuffer());
    }
  } catch {
    // fall through to SDK read
  }
  return readBlobViaSdk(blobId);
}

export async function readJson<T>(blobId: string): Promise<T> {
  const bytes = await readBlob(blobId);
  return JSON.parse(new TextDecoder().decode(bytes));
}
