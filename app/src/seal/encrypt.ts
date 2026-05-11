import { toHex } from "@mysten/sui/utils";

import { PACKAGE_ID, SEAL_THRESHOLD } from "../config";
import { getSealClient } from "./client";
import {
  buildAllowlistIdentity,
  buildTimelockIdentity,
  buildTokenGatedIdentity,
} from "../helpers/identity";

export type EncryptArgs =
  | { kind: "allowlist"; allowlistObjectId: string; formId: string; data: Uint8Array }
  | { kind: "timelock"; unlockTimeMs: bigint; formId: string; data: Uint8Array }
  | { kind: "tokenGated"; gateObjectId: string; formId: string; data: Uint8Array };

export type EncryptResult = {
  ciphertext: Uint8Array;
  /** Backup symmetric key (store offline only for disaster recovery). */
  backupKey: Uint8Array;
};

export async function encryptForForm(args: EncryptArgs): Promise<EncryptResult> {
  const client = getSealClient();
  const idHex = toHex(buildIdentity(args));

  const { encryptedObject, key } = await client.encrypt({
    threshold: SEAL_THRESHOLD,
    packageId: PACKAGE_ID,
    id: idHex,
    data: args.data,
  });

  return { ciphertext: encryptedObject, backupKey: key };
}

function buildIdentity(args: EncryptArgs): Uint8Array {
  switch (args.kind) {
    case "allowlist":
      return buildAllowlistIdentity(args.allowlistObjectId, args.formId);
    case "timelock":
      return buildTimelockIdentity(args.unlockTimeMs, args.formId);
    case "tokenGated":
      return buildTokenGatedIdentity(args.gateObjectId, args.formId);
  }
}
