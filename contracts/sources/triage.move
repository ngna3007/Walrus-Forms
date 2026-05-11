/// Triage: state machine for submission status. Only the form owner may transition.
module walrus_forms::triage;

use walrus_forms::form_registry::{Self, Form};
use walrus_forms::submission::{Self, Submission};

const EUnauthorized: u64 = 1;
const EFormMismatch: u64 = 2;
const EInvalidTransition: u64 = 3;

/// Allowed transitions:
///   Open → Triaged | Resolved
///   Triaged → InProgress | Resolved
///   InProgress → Resolved | Triaged
///   Resolved → (terminal)
public fun transition(
    form: &Form,
    sub: &mut Submission,
    new_status: u8,
    ctx: &TxContext,
) {
    assert!(form_registry::owner(form) == tx_context::sender(ctx), EUnauthorized);
    assert!(submission::form_id(sub) == sui::object::id(form), EFormMismatch);

    let current = submission::status(sub);
    assert!(is_valid_transition(current, new_status), EInvalidTransition);

    submission::set_status(sub, new_status);
}

fun is_valid_transition(from: u8, to: u8): bool {
    let open = submission::status_open();
    let triaged = submission::status_triaged();
    let in_progress = submission::status_in_progress();
    let resolved = submission::status_resolved();

    if (from == open) {
        to == triaged || to == resolved
    } else if (from == triaged) {
        to == in_progress || to == resolved
    } else if (from == in_progress) {
        to == resolved || to == triaged
    } else {
        false
    }
}
