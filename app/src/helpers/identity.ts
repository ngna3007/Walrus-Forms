import { bcs } from "@mysten/bcs";
import { fromHex } from "@mysten/sui/utils";

/** Allowlist identity = allowlist_object_id_bytes || form_id_bytes */
export function buildAllowlistIdentity(allowlistObjectId: string, formId: string): Uint8Array {
  return concat(toIdBytes(allowlistObjectId), toIdBytes(formId));
}

/** Timelock identity = bcs::to_bytes(unlock_time_ms) || form_id_bytes */
export function buildTimelockIdentity(unlockTimeMs: bigint, formId: string): Uint8Array {
  const time = bcs.u64().serialize(unlockTimeMs).toBytes();
  return concat(time, toIdBytes(formId));
}

/** Token-gated identity = gate_object_id_bytes || form_id_bytes */
export function buildTokenGatedIdentity(gateObjectId: string, formId: string): Uint8Array {
  return concat(toIdBytes(gateObjectId), toIdBytes(formId));
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
