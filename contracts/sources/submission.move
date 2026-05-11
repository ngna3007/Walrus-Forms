/// Submission: an immutable record on Sui pointing at a (possibly encrypted) Walrus blob.
module walrus_forms::submission;

use std::string::String;
use sui::clock::{Self, Clock};
use sui::event;

use walrus_forms::form_registry::{Self, Form};

const EFormClosed: u64 = 1;

const STATUS_OPEN: u8 = 0;
const STATUS_TRIAGED: u8 = 1;
const STATUS_IN_PROGRESS: u8 = 2;
const STATUS_RESOLVED: u8 = 3;

public struct Submission has key {
    id: UID,
    form_id: ID,
    submitter: address,
    blob_id: String,
    status: u8,
    submitted_at_ms: u64,
    /// Optional file blob IDs (screenshots, video).
    file_blob_ids: vector<String>,
}

public struct SubmissionCreated has copy, drop {
    submission_id: ID,
    form_id: ID,
    submitter: address,
    blob_id: String,
    submitted_at_ms: u64,
}

public struct SubmissionStatusChanged has copy, drop {
    submission_id: ID,
    old_status: u8,
    new_status: u8,
}

public fun submit(
    form: &mut Form,
    blob_id: String,
    file_blob_ids: vector<String>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(form_registry::is_open(form), EFormClosed);

    let submitted_at_ms = clock::timestamp_ms(clock);
    let submission = Submission {
        id: object::new(ctx),
        form_id: object::id(form),
        submitter: tx_context::sender(ctx),
        blob_id,
        status: STATUS_OPEN,
        submitted_at_ms,
        file_blob_ids,
    };

    form_registry::increment_submission_count(form);

    event::emit(SubmissionCreated {
        submission_id: object::id(&submission),
        form_id: object::id(form),
        submitter: submission.submitter,
        blob_id: submission.blob_id,
        submitted_at_ms,
    });

    transfer::share_object(submission);
}

public(package) fun set_status(submission: &mut Submission, new_status: u8) {
    let old_status = submission.status;
    submission.status = new_status;
    event::emit(SubmissionStatusChanged {
        submission_id: object::id(submission),
        old_status,
        new_status,
    });
}

public fun form_id(submission: &Submission): ID { submission.form_id }
public fun status(submission: &Submission): u8 { submission.status }
public fun blob_id(submission: &Submission): String { submission.blob_id }
public fun submitter(submission: &Submission): address { submission.submitter }

public fun status_open(): u8 { STATUS_OPEN }
public fun status_triaged(): u8 { STATUS_TRIAGED }
public fun status_in_progress(): u8 { STATUS_IN_PROGRESS }
public fun status_resolved(): u8 { STATUS_RESOLVED }
