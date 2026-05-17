/// Form registry: each Form is a shared object with a Walrus schema blob and a Seal policy type.
module walrus_forms::form_registry;

use std::string::String;
use sui::event;
use walrus_forms::seal_policies::{Self, Allowlist};
use sui_groups::permissioned_group::{Self, PermissionedGroup};

/// Witness type scoping PermissionedGroup to Walrus Forms.
public struct WF has drop {}

const EUnauthorized: u64 = 1;

const POLICY_PUBLIC: u8 = 0;
const POLICY_ALLOWLIST: u8 = 1;
const POLICY_TIMELOCK: u8 = 2;
const POLICY_TOKEN_GATED: u8 = 3;

public struct Form has key {
    id: UID,
    owner: address,
    title: String,
    schema_blob_id: String,
    policy_type: u8,
    /// Optional reference to a policy object (Allowlist, Subscription, etc).
    policy_object_id: vector<u8>,
    /// For time-lock policy: ms timestamp after which submissions decrypt.
    unlock_time_ms: u64,
    submission_count: u64,
    open: bool,
}

public struct FormCreated has copy, drop {
    form_id: ID,
    owner: address,
    schema_blob_id: String,
    policy_type: u8,
}

public struct FormUpdated has copy, drop {
    form_id: ID,
    schema_blob_id: String,
}

public struct FormClosed has copy, drop {
    form_id: ID,
}

public fun create_form(
    title: String,
    schema_blob_id: String,
    policy_type: u8,
    policy_object_id: vector<u8>,
    unlock_time_ms: u64,
    ctx: &mut TxContext,
) {
    let form = build_form(title, schema_blob_id, policy_type, policy_object_id, unlock_time_ms, ctx);
    transfer::share_object(form);
}

/// One-shot publish: create the Allowlist and the Form in the SAME PTB so the
/// user only signs once. Takes the Allowlist by value (constructed earlier in
/// the same PTB via `seal_policies::new_allowlist`), reads its object id for
/// `policy_object_id`, then shares both objects.
public fun create_form_with_allowlist(
    title: String,
    schema_blob_id: String,
    list: Allowlist,
    ctx: &mut TxContext,
) {
    let policy_object_id = seal_policies::allowlist_id_bytes(&list);
    let form = build_form(title, schema_blob_id, POLICY_ALLOWLIST, policy_object_id, 0, ctx);
    transfer::share_object(form);
    seal_policies::share_allowlist(list);
}

fun build_form(
    title: String,
    schema_blob_id: String,
    policy_type: u8,
    policy_object_id: vector<u8>,
    unlock_time_ms: u64,
    ctx: &mut TxContext,
): Form {
    let form = Form {
        id: object::new(ctx),
        owner: tx_context::sender(ctx),
        title,
        schema_blob_id,
        policy_type,
        policy_object_id,
        unlock_time_ms,
        submission_count: 0,
        open: true,
    };

    event::emit(FormCreated {
        form_id: object::id(&form),
        owner: form.owner,
        schema_blob_id: form.schema_blob_id,
        policy_type,
    });

    form
}

public fun close_form(form: &mut Form, ctx: &TxContext) {
    assert!(form.owner == tx_context::sender(ctx), EUnauthorized);
    form.open = false;
    event::emit(FormClosed { form_id: object::id(form) });
}

/// In-place schema edit. Owner only.
///
/// Replaces the title and Walrus schema blob id of an existing shared Form,
/// leaving the form's object id, allowlist, submissions, and submission count
/// untouched. Cheap path for edits: no new Form object on Sui, and Walrus
/// deduplicates the schema blob if the JSON didn't actually change.
public fun update_form(
    form: &mut Form,
    new_title: String,
    new_schema_blob_id: String,
    ctx: &TxContext,
) {
    assert!(form.owner == tx_context::sender(ctx), EUnauthorized);
    form.title = new_title;
    form.schema_blob_id = new_schema_blob_id;
    event::emit(FormUpdated {
        form_id: object::id(form),
        schema_blob_id: new_schema_blob_id,
    });
}

public(package) fun increment_submission_count(form: &mut Form) {
    form.submission_count = form.submission_count + 1;
}

public fun owner(form: &Form): address { form.owner }
public fun policy_type(form: &Form): u8 { form.policy_type }
public fun policy_object_id(form: &Form): vector<u8> { form.policy_object_id }
public fun unlock_time_ms(form: &Form): u64 { form.unlock_time_ms }
public fun is_open(form: &Form): bool { form.open }
public fun schema_blob_id(form: &Form): String { form.schema_blob_id }

public fun policy_public(): u8 { POLICY_PUBLIC }
public fun policy_allowlist(): u8 { POLICY_ALLOWLIST }
public fun policy_timelock(): u8 { POLICY_TIMELOCK }
public fun policy_token_gated(): u8 { POLICY_TOKEN_GATED }

/// Create a sui_groups PermissionedGroup scoped to Walrus Forms.
/// Call this in the same PTB as create_form / create_form_with_allowlist.
/// Transfer the returned group to sender — they become PermissionsAdmin.
public fun create_form_group(ctx: &mut TxContext): PermissionedGroup<WF> {
    permissioned_group::new(WF {}, ctx)
}
