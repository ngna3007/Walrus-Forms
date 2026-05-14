/// Submitter reputation as soulbound submission receipts.
///
/// Each time the form owner resolves a submission (and the submitter is not the
/// owner themselves), this module mints a `SubmissionReceipt` owned by the
/// submitter. The receipt has `key` only — no `store` — so it cannot be
/// transferred via `sui::transfer::public_transfer`, wrapped in another object,
/// or stored as a dynamic field. This makes the receipts soulbound: portable
/// across dApps via `getOwnedObjects`, immutable, and tied to a single wallet.
///
/// Cross-dApp consumers query:
///   client.getOwnedObjects({
///     owner,
///     filter: { StructType: `${PKG}::reputation::SubmissionReceipt` },
///   })
/// and aggregate by `severity` to derive a portable reputation score.
module walrus_forms::reputation;

use sui::clock::{Self, Clock};
use sui::event;

use walrus_forms::form_registry::{Self, Form};
use walrus_forms::submission::{Self, Submission};

const ENotFormOwner: u64 = 1;
const ESelfMint: u64 = 2;
const EFormMismatch: u64 = 3;

/// Soulbound receipt. `key` only — no `store` ability so callers cannot use
/// `transfer::public_transfer`. The mint function calls `transfer::transfer`
/// from inside this module, which is the only legal way to move the receipt.
public struct SubmissionReceipt has key {
    id: UID,
    form_id: ID,
    submission_id: ID,
    submitter: address,
    severity: u8,
    resolved_at_ms: u64,
}

public struct ReceiptMinted has copy, drop {
    receipt_id: ID,
    form_id: ID,
    submission_id: ID,
    submitter: address,
    severity: u8,
}

/// Form owner mints a permanent soulbound receipt to the submitter.
///
/// Aborts if:
///   - caller is not the form owner
///   - submission belongs to a different form
///   - submitter == form owner (anti-self-credit gate)
public fun mint_receipt(
    form: &Form,
    submission: &Submission,
    severity: u8,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(form_registry::owner(form) == tx_context::sender(ctx), ENotFormOwner);
    assert!(submission::form_id(submission) == object::id(form), EFormMismatch);

    let submitter = submission::submitter(submission);
    assert!(submitter != form_registry::owner(form), ESelfMint);

    let receipt = SubmissionReceipt {
        id: object::new(ctx),
        form_id: object::id(form),
        submission_id: object::id(submission),
        submitter,
        severity,
        resolved_at_ms: clock::timestamp_ms(clock),
    };

    event::emit(ReceiptMinted {
        receipt_id: object::id(&receipt),
        form_id: object::id(form),
        submission_id: object::id(submission),
        submitter,
        severity,
    });

    // `transfer::transfer` requires the type to be defined in this module.
    // Combined with the missing `store` ability, this makes the receipt
    // soulbound: only this module can ever move it, and it never does.
    transfer::transfer(receipt, submitter);
}

public fun submitter(r: &SubmissionReceipt): address { r.submitter }
public fun severity(r: &SubmissionReceipt): u8 { r.severity }
public fun form_id(r: &SubmissionReceipt): ID { r.form_id }
public fun submission_id(r: &SubmissionReceipt): ID { r.submission_id }
public fun resolved_at_ms(r: &SubmissionReceipt): u64 { r.resolved_at_ms }
