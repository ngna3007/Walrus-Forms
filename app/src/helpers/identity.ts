import { bcs } from "@mysten/bcs";
import { fromHex } from "@mysten/sui/utils";

const NONCE_BYTES = 16;

function randomNonce(): Uint8Array {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    return crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  }
  // Fallback for SSR / older environments — deterministic but unique-enough for
  // identity uniqueness. Production should always have window.crypto.
  const out = new Uint8Array(NONCE_BYTES);
  for (let i = 0; i < NONCE_BYTES; i++) out[i] = Math.floor(Math.random() * 256);
  return out;
}

/**
 * Allowlist identity = allowlist_object_id_bytes (32) || random_nonce (16).
 *
 * The form_id used to be the suffix, but that meant every submission to the same
 * form derived the SAME IBE key — one leaked key share = every submission decrypts.
 * Per-submission random nonce matches the canonical Seal allowlist pattern (see
 * sui-move-bootcamp K5/seal-demo) and guarantees a fresh derived key per ciphertext.
 *
 * `seal_approve_allowlist` on the Move side validates the 32-byte prefix matches the
 * allowlist object id; trailing nonce bytes are not interpreted.
 */
export function buildAllowlistIdentity(allowlistObjectId: string, _formId: string): Uint8Array {
  return concat(toIdBytes(allowlistObjectId), randomNonce());
}

/** Timelock identity = bcs::to_bytes(unlock_time_ms) (8) || random_nonce (16). */
export function buildTimelockIdentity(unlockTimeMs: bigint, _formId: string): Uint8Array {
  const time = bcs.u64().serialize(unlockTimeMs).toBytes();
  return concat(time, randomNonce());
}

/** Token-gated identity = gate_object_id_bytes (32) || random_nonce (16). */
export function buildTokenGatedIdentity(gateObjectId: string, _formId: string): Uint8Array {
  return concat(toIdBytes(gateObjectId), randomNonce());
}

function toIdBytes(objectId: string): Uint8Array {
  return fromHex(objectId.startsWith("0x") ? objectId.slice(2) : objectId);
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}
