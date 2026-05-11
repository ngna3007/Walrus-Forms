import { EncryptedObject, SessionKey } from "@mysten/seal";
import type { Signer } from "@mysten/sui/cryptography";
import { fromHex } from "@mysten/sui/utils";

import { PACKAGE_ID, SESSION_KEY_TTL_MIN } from "../config";
import { getSealClient, getSuiClient } from "./client";
import {
  buildAllowlistApprovePtb,
  buildTimelockApprovePtb,
  buildTokenGatedApprovePtb,
} from "../helpers/ptb";

export type DecryptArgs = {
  ciphertext: Uint8Array;
  signer: Signer;
  /** Required for allowlist + token-gated policies. */
  policyObjectId?: string;
};

let cachedSession: { key: SessionKey; address: string; expiresAt: number } | null = null;

async function getOrCreateSession(signer: Signer): Promise<SessionKey> {
  const address = signer.toSuiAddress();
  const now = Date.now();
  if (cachedSession && cachedSession.address === address && cachedSession.expiresAt > now) {
    return cachedSession.key;
  }

  const key = await SessionKey.create({
    address,
    packageId: PACKAGE_ID,
    ttlMin: SESSION_KEY_TTL_MIN,
    signer,
    suiClient: getSuiClient(),
  });

  cachedSession = {
    key,
    address,
    expiresAt: now + SESSION_KEY_TTL_MIN * 60 * 1000 - 30_000,
  };
  return key;
}

export async function decryptSubmission(args: DecryptArgs): Promise<Uint8Array> {
  const seal = getSealClient();
  const sui = getSuiClient();

  const parsed = EncryptedObject.parse(args.ciphertext);
  const sessionKey = await getOrCreateSession(args.signer);

  const identity = fromHex(parsed.id);
  const txBytes = await buildApprovePtb(sui, identity, args.policyObjectId);

  return seal.decrypt({
    data: args.ciphertext,
    sessionKey,
    txBytes,
  });
}

async function buildApprovePtb(
  sui: ReturnType<typeof getSuiClient>,
  identity: Uint8Array,
  policyObjectId: string | undefined,
): Promise<Uint8Array> {
  // Identity prefix tells us which policy was used. The first 32 bytes refer to a
  // Sui object ID for allowlist / token-gated, or a u64 timestamp for timelock.
  // Caller must hint via `policyObjectId`.
  if (!policyObjectId) {
    return buildTimelockApprovePtb(sui, identity);
  }
  return buildAllowlistApprovePtb(sui, identity, policyObjectId).catch(() =>
    buildTokenGatedApprovePtb(sui, identity, policyObjectId),
  );
}
