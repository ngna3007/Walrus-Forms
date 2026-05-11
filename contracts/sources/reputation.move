/// Submitter reputation records.
///
/// Indexers consume the events to build search/filter facets while the shared
/// object provides an on-chain score that can be checked by other contracts.
module walrus_forms::reputation;

use sui::event;

const ENotOwner: u64 = 1;

public struct SubmitterReputation has key {
    id: UID,
    owner: address,
    submitter: address,
    submissions: u64,
    resolved: u64,
    score: u64,
}

public struct ReputationChanged has copy, drop {
    reputation_id: ID,
    submitter: address,
    submissions: u64,
    resolved: u64,
    score: u64,
}

public fun create(submitter: address, ctx: &mut TxContext) {
    let reputation = SubmitterReputation {
        id: object::new(ctx),
        owner: tx_context::sender(ctx),
        submitter,
        submissions: 0,
        resolved: 0,
        score: 0,
    };
    emit_change(&reputation);
    transfer::share_object(reputation);
}

public fun record_submission(rep: &mut SubmitterReputation, ctx: &TxContext) {
    assert!(rep.owner == tx_context::sender(ctx), ENotOwner);
    rep.submissions = rep.submissions + 1;
    rep.score = calculate_score(rep.submissions, rep.resolved);
    emit_change(rep);
}

public fun record_resolution(rep: &mut SubmitterReputation, ctx: &TxContext) {
    assert!(rep.owner == tx_context::sender(ctx), ENotOwner);
    rep.resolved = rep.resolved + 1;
    rep.score = calculate_score(rep.submissions, rep.resolved);
    emit_change(rep);
}

fun calculate_score(submissions: u64, resolved: u64): u64 {
    let base = submissions * 5;
    let quality = resolved * 20;
    let score = base + quality;
    if (score > 100) 100 else score
}

fun emit_change(rep: &SubmitterReputation) {
    event::emit(ReputationChanged {
        reputation_id: object::id(rep),
        submitter: rep.submitter,
        submissions: rep.submissions,
        resolved: rep.resolved,
        score: rep.score,
    });
}

public fun submitter(rep: &SubmitterReputation): address { rep.submitter }
public fun score(rep: &SubmitterReputation): u64 { rep.score }
public fun submissions(rep: &SubmitterReputation): u64 { rep.submissions }
public fun resolved(rep: &SubmitterReputation): u64 { rep.resolved }
