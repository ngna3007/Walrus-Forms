/// Seal access policies for form submissions.
///
/// Identity layout for each pattern:
///   Allowlist:    [PkgId][allowlist_object_id][form_id]
///   Time-lock:    [PkgId][bcs::to_bytes(unlock_time_ms)][form_id]
///   Token-gated:  [PkgId][gate_object_id][form_id]
///
/// `seal_approve_*` are entry, non-public, side-effect free. Key servers run them
/// via `dry_run_transaction_block` and release decryption keys only on no-abort.
module walrus_forms::seal_policies;

use sui::bcs;
use sui::clock::{Self, Clock};

const ENoAccess: u64 = 0;
const EBadIdentity: u64 = 1;

// ─── Allowlist ───────────────────────────────────────────────────────────────

public struct Allowlist has key {
    id: UID,
    owner: address,
    members: vector<address>,
}

public fun create_allowlist(ctx: &mut TxContext) {
    let list = Allowlist {
        id: object::new(ctx),
        owner: tx_context::sender(ctx),
        members: vector[],
    };
    transfer::share_object(list);
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

/// Identity prefix must equal `bcs::to_bytes(allowlist_id)`.
entry fun seal_approve_allowlist(
    id: vector<u8>,
    list: &Allowlist,
    ctx: &TxContext,
) {
    let expected_prefix = bcs::to_bytes(&object::id(list));
    assert!(starts_with(&id, &expected_prefix), EBadIdentity);
    assert!(contains(list, tx_context::sender(ctx)), ENoAccess);
}

// ─── Time-lock ───────────────────────────────────────────────────────────────

/// Identity = bcs(unlock_time_ms) || form_id_bytes
entry fun seal_approve_timelock(id: vector<u8>, c: &Clock) {
    let mut prepared = bcs::new(id);
    let unlock = bcs::peel_u64(&mut prepared);
    assert!(clock::timestamp_ms(c) >= unlock, ENoAccess);
}

// ─── Token-gated ─────────────────────────────────────────────────────────────

/// Caller must own at least one object whose ID matches gate_object_id.
/// In practice, you'd pass the owned object as a parameter and check its type.
/// Here we use a simple shared `Gate` registry checking sender membership.
public struct Gate has key {
    id: UID,
    /// Holder set; updated by the gate owner or by NFT mint hooks off this module.
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
