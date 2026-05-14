import { EncryptedObject, SessionKey } from "@mysten/seal";

import { getSealClient, getSuiClient } from "./client";
import {
  buildAllowlistApprovePtb,
  buildTimelockApprovePtb,
  buildTokenGatedApprovePtb,
} from "../helpers/ptb";
import type { FormPolicy } from "../forms/submit";

export type DecryptArgs = {
  ciphertext: Uint8Array;
  sessionKey: SessionKey;
  /**
   * Explicit policy kind + policy object id. Required so the decrypt-side PTB matches
   * the policy used at encrypt time. Previously the call site relied on a try/catch
   * heuristic ("try allowlist, fall back to token-gated") which surfaced cryptic Seal
   * errors when the wrong policy PTB was sent.
   */
  policy: FormPolicy;
};

export async function decryptSubmission(args: DecryptArgs): Promise<Uint8Array> {
  const seal = getSealClient();
  const sui = getSuiClient();

  const parsed = EncryptedObject.parse(args.ciphertext);
  const identity = toBytes(parsed.id);

  const txBytes = await buildPolicyApprovePtb(sui, args.policy, identity);

  return seal.decrypt({
    data: args.ciphertext,
    sessionKey: args.sessionKey,
    txBytes,
  });
}

async function buildPolicyApprovePtb(
  sui: ReturnType<typeof getSuiClient>,
  policy: FormPolicy,
  identity: Uint8Array,
): Promise<Uint8Array> {
  switch (policy.kind) {
    case "allowlist":
      return buildAllowlistApprovePtb(sui, identity, policy.allowlistObjectId);
    case "timelock":
      return buildTimelockApprovePtb(sui, identity);
    case "tokenGated":
      return buildTokenGatedApprovePtb(sui, identity, policy.gateObjectId);
    case "public":
      throw new Error("Public submissions do not require Seal decryption.");
  }
}

function toBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return Uint8Array.from(value);
  if (typeof value === "string") {
    const clean = value.startsWith("0x") ? value.slice(2) : value;
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    return bytes;
  }
  throw new Error("Encrypted object identity has an unsupported encoding.");
}
