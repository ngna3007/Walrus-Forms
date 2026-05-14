/// Seal access policies for form submissions.
///
/// Identity layout after the audit refactor:
///   Allowlist:    [PkgId][allowlist_object_id (32)][random_nonce (16)]
///   Time-lock:    [PkgId][bcs::to_bytes(unlock_time_ms) (8)][random_nonce (16)]
///   Token-gated:  [PkgId][gate_object_id (32)][random_nonce (16)]
///
/// The per-message random nonce gives every ciphertext a unique IBE identity (and
/// therefore a unique derived key) so a single leaked key share never decrypts the
/// entire form. Matches the canonical Seal allowlist pattern (sui-move-bootcamp
/// K5/seal-demo).
///
/// `seal_approve_*` are entry, non-public, side-effect free. Key servers run them
/// via `dry_run_transaction_block` and release decryption keys only on no-abort.
module walrus_forms::seal_policies;

use sui::bcs;
use sui::clock::{Self, Clock};

const ENoAccess: u64 = 0;
const EBadIdentity: u64 = 1;

const NONCE_BYTES: u64 = 16;
const ALLOWLIST_ID_LEN: u64 = 48;  // 32 object id + 16 nonce
const TIMELOCK_ID_LEN: u64 = 24;   // 8 u64 + 16 nonce
const TOKEN_GATED_ID_LEN: u64 = 48;

// ─── Allowlist ───────────────────────────────────────────────────────────────

public struct Allowlist has key, store {
    id: UID,
    owner: address,
    members: vector<address>,
}

public fun create_allowlist(ctx: &mut TxContext) {
    transfer::share_object(new_allowlist(ctx));
}

/// Create an Allowlist and return it by value. Allows the caller to splice
/// `add_member` and `form_registry::create_form_with_allowlist` into the SAME
/// PTB so publishing an allowlist-gated form only requires one wallet signature.
public fun new_allowlist(ctx: &mut TxContext): Allowlist {
    Allowlist {
        id: object::new(ctx),
        owner: tx_context::sender(ctx),
        members: vector[],
    }
}

/// Public re-share. Used by `create_form_with_allowlist` after attaching the
/// allowlist to a Form; the standalone `create_allowlist` path already shares
/// internally. The Allowlist passed here is always freshly created in the same
/// PTB (via `new_allowlist`), so the lint is safe to suppress.
#[allow(lint(share_owned))]
public fun share_allowlist(list: Allowlist) {
    transfer::public_share_object(list);
}

/// Read the object id of an Allowlist. Used by callers that just constructed
/// the allowlist via `new_allowlist` and need its id without having shared it yet.
public fun allowlist_id_bytes(list: &Allowlist): vector<u8> {
    sui::bcs::to_bytes(&object::id(list))
}

public fun add_member(list: &mut Allowlist, member: address, ctx: &TxContext) {
    assert!(list.owner == tx_context::sender(ctx), ENoAccess);
    if (!vector::contains(&list.members, &member)) {
        vector::push_back(&mut list.members, member);
    };
}

public fun remove_member(list: &mut Allowlist, member: address, ctx: &TxContext) {
    assert!(list.owner == tx_context::sender(ctx), ENoAccess);
    let (found, idx) = vector::index_of(&list.members, &member);
    if (found) {
        vector::remove(&mut list.members, idx);
    };
}

public fun contains(list: &Allowlist, addr: address): bool {
    vector::contains(&list.members, &addr)
}

/// Identity prefix must equal `bcs::to_bytes(allowlist_id)` and the identity
/// must be exactly `ALLOWLIST_ID_LEN` bytes (object id + nonce). Strict-parse
/// follows the canonical Seal pattern of fully consuming the identity bytes.
entry fun seal_approve_allowlist(
    id: vector<u8>,
    list: &Allowlist,
    ctx: &TxContext,
) {
    assert!(vector::length(&id) == ALLOWLIST_ID_LEN, EBadIdentity);
    let expected_prefix = bcs::to_bytes(&object::id(list));
    assert!(starts_with(&id, &expected_prefix), EBadIdentity);
    assert!(contains(list, tx_context::sender(ctx)), ENoAccess);
}

// ─── Time-lock ───────────────────────────────────────────────────────────────

/// Identity = bcs(unlock_time_ms) || random_nonce(16).
/// Strict-parse: peel exactly one u64, require exactly NONCE_BYTES remainder.
entry fun seal_approve_timelock(id: vector<u8>, c: &Clock) {
    assert!(vector::length(&id) == TIMELOCK_ID_LEN, EBadIdentity);
    let mut prepared = bcs::new(id);
    let unlock = bcs::peel_u64(&mut prepared);
    let leftover = bcs::into_remainder_bytes(prepared);
    assert!(vector::length(&leftover) == NONCE_BYTES, EBadIdentity);
    assert!(clock::timestamp_ms(c) >= unlock, ENoAccess);
}

// ─── Token-gated ─────────────────────────────────────────────────────────────

/// Token-gated policy via a per-form holder registry. For richer NFT-ownership
/// patterns, take the owned object as a PTB argument and verify type + ownership
/// at decrypt time (see Seal subscription example).
public struct Gate has key {
    id: UID,
    /// Holder set; updated by the gate owner.
    holders: vector<address>,
    owner: address,
}

public fun create_gate(ctx: &mut TxContext) {
    transfer::share_object(Gate {
        id: object::new(ctx),
        holders: vector[],
        owner: tx_context::sender(ctx),
    });
}

public fun grant(gate: &mut Gate, who: address, ctx: &TxContext) {
    assert!(gate.owner == tx_context::sender(ctx), ENoAccess);
    if (!vector::contains(&gate.holders, &who)) {
        vector::push_back(&mut gate.holders, who);
    };
}

entry fun seal_approve_token_gated(
    id: vector<u8>,
    gate: &Gate,
    ctx: &TxContext,
) {
    assert!(vector::length(&id) == TOKEN_GATED_ID_LEN, EBadIdentity);
    let expected_prefix = bcs::to_bytes(&object::id(gate));
    assert!(starts_with(&id, &expected_prefix), EBadIdentity);
    assert!(vector::contains(&gate.holders, &tx_context::sender(ctx)), ENoAccess);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

fun starts_with(haystack: &vector<u8>, needle: &vector<u8>): bool {
    let h_len = vector::length(haystack);
    let n_len = vector::length(needle);
    if (n_len > h_len) return false;
    let mut i = 0;
    while (i < n_len) {
        if (*vector::borrow(haystack, i) != *vector::borrow(needle, i)) {
            return false
        };
        i = i + 1;
    };
    true
}

