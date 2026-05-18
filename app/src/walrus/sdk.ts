import { SuiGrpcClient } from "@mysten/sui/grpc";
import type { Transaction } from "@mysten/sui/transactions";
import { walrus } from "@mysten/walrus";

import { FULLNODE_URL, NETWORK, WALRUS_DEFAULT_EPOCHS } from "../config";

/**
 * Walrus TS SDK client (stack-native: users pay their own storage via wallet).
 *
 * Reference:
 *   https://sdk.mystenlabs.com/walrus
 *   https://github.com/MystenLabs/ts-sdks/tree/main/packages/walrus/examples/write-from-wallet
 */

let _client: ReturnType<typeof createClient> | null = null;

function createClient() {
  return new SuiGrpcClient({
    network: NETWORK,
    baseUrl: FULLNODE_URL,
  }).$extend(
    walrus(
      NETWORK === "mainnet"
        ? { uploadRelay: { host: "https://upload-relay.mainnet.walrus.space", sendTip: { max: 1_000_000_000 } } }
        : {},
    ),
  );
}

export function getWalrusSdkClient() {
  if (!_client) _client = createClient();
  return _client;
}

export type SignAndExecute = (args: { transaction: Transaction }) => Promise<unknown>;

/** Called with the certify tx before it is signed. Add extra Move calls to merge them into one popup. */
export type AugmentCertifyTx = (blobId: string, tx: Transaction) => void;

export interface WriteFilesArgs {
  files: { contents: Uint8Array; identifier: string }[];
  /** Address that will own the resulting Walrus `Blob` NFTs. Usually the connected wallet. */
  owner: string;
  epochs?: number;
  deletable?: boolean;
  signAndExecute: SignAndExecute;
  /** Optional: inject extra Move calls into the certify tx to merge certify + other ops into one popup. */
  augmentCertifyTx?: AugmentCertifyTx;
}

export interface WriteFilesResult {
  blobId: string;
  objectId: string;
  identifier: string;
  /** Result of the certify transaction (includes any augmented calls). */
  certifyTxResult: unknown;
}

/**
 * Browser wallet upload via `writeFilesFlow`.
 *
 * The flow has five steps. `register` and `certify` each open a wallet popup;
 * the upload step runs in the background. Wallets block popups that aren't a
 * direct response to user interaction, so call this only inside an event handler.
 */
export async function writeFilesWithWallet({
  files,
  owner,
  epochs = WALRUS_DEFAULT_EPOCHS,
  deletable = false,
  signAndExecute,
  augmentCertifyTx,
}: WriteFilesArgs): Promise<WriteFilesResult[]> {
  const client = getWalrusSdkClient();

  // Use writeBlobFlow per file (raw blob, no quilt wrapping) so blobIds are
  // plain blob IDs readable by HTTP aggregators and readJson.
  return Promise.all(
    files.map(async (file) => {
      const flow = client.walrus.writeBlobFlow({ blob: file.contents });

      const encoded = await flow.encode();

      const registerTx = flow.register({ epochs, owner, deletable });
      const registerResult = await signAndExecute({ transaction: registerTx });
      const registerDigest = (registerResult as { digest?: string })?.digest;

      await flow.upload({ digest: registerDigest });

      const certifyTx = flow.certify();
      if (augmentCertifyTx) augmentCertifyTx(encoded.blobId, certifyTx);
      const certifyTxResult = await signAndExecute({ transaction: certifyTx });

      const blob = await flow.getBlob();
      return {
        blobId: blob.blobId,
        objectId: blob.blobObjectId,
        identifier: file.identifier,
        certifyTxResult,
      };
    }),
  );
}

/** Read a blob through the SDK. Slower than aggregator HTTP but no aggregator trust. */
export async function readBlobViaSdk(blobId: string): Promise<Uint8Array> {
  const client = getWalrusSdkClient();
  const bytes = await client.walrus.readBlob({ blobId });
  return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
}
