/// Sponsored bounty escrow with severity-tiered payouts.
///
/// Sponsor deposits a `Coin<T>` and declares four severity tier amounts
/// (index 0 = Low, 1 = Medium, 2 = High, 3 = Critical). The form owner releases
/// a payout to the submitter of a specific submission, picking the severity
/// based on triage outcome. Each submission can only be paid once. The
/// submitter must not be the form owner (anti-self-payout gate).
///
/// The type parameter `T` is the payout coin type — `0x2::sui::SUI` for testnet
/// demos, or the WAL coin type for production.
module walrus_forms::bounty;

use sui::balance::{Self, Balance};
use sui::coin::{Self, Coin};
use sui::event;
use sui::table::{Self, Table};

use walrus_forms::form_registry::{Self, Form};
use walrus_forms::submission::{Self, Submission};

const ENotSponsor: u64 = 1;
const EAlreadyPaid: u64 = 2;
const ESelfPayout: u64 = 3;
const EBadTiers: u64 = 4;
const EInsufficientBalance: u64 = 5;
const EFormMismatch: u64 = 6;
const EBadSeverity: u64 = 7;

const NUM_TIERS: u64 = 4; // Low Medium High Critical

public struct SponsoredBounty<phantom T> has key {
    id: UID,
    form_id: ID,
    sponsor: address,
    payout: Balance<T>,
    /// `tiers[severity]` = payout amount, in coin's smallest unit.
    tiers: vector<u64>,
    /// submission_id -> recipient, prevents double payout.
    paid: Table<ID, address>,
}

public struct BountySponsored has copy, drop {
    bounty_id: ID,
    form_id: ID,
    sponsor: address,
    amount: u64,
    tiers: vector<u64>,
}

public struct BountyPaid has copy, drop {
    bounty_id: ID,
    form_id: ID,
    submission_id: ID,
    recipient: address,
    severity: u8,
    amount: u64,
}

public struct BountyWithdrawn has copy, drop {
    bounty_id: ID,
    sponsor: address,
    amount: u64,
}

public fun sponsor<T>(
    form_id: ID,
    payout: Coin<T>,
    tiers: vector<u64>,
    ctx: &mut TxContext,
) {
    assert!(vector::length(&tiers) == NUM_TIERS, EBadTiers);
    let amount = coin::value(&payout);
    let bounty = SponsoredBounty<T> {
        id: object::new(ctx),
        form_id,
        sponsor: tx_context::sender(ctx),
        payout: coin::into_balance(payout),
        tiers,
        paid: table::new(ctx),
    };

    event::emit(BountySponsored {
        bounty_id: object::id(&bounty),
        form_id,
        sponsor: bounty.sponsor,
        amount,
        tiers,
    });

    transfer::share_object(bounty);
}

/// Top up an existing bounty with additional coins.
public fun top_up<T>(
    bounty: &mut SponsoredBounty<T>,
    payout: Coin<T>,
    ctx: &TxContext,
) {
    assert!(bounty.sponsor == tx_context::sender(ctx), ENotSponsor);
    balance::join(&mut bounty.payout, coin::into_balance(payout));
}

/// Form owner releases the severity-tier amount to the submission's submitter.
///
/// Aborts if:
///   - caller is not the form owner
///   - bounty / submission point at different forms
///   - submitter == form owner (anti-self-payout)
///   - submission already paid
///   - severity out of range (>= 4)
///   - bounty balance below tier amount
public fun release<T>(
    bounty: &mut SponsoredBounty<T>,
    form: &Form,
    submission: &Submission,
    severity: u8,
    ctx: &mut TxContext,
) {
    assert!(form_registry::owner(form) == tx_context::sender(ctx), ENotSponsor);
    assert!(bounty.form_id == object::id(form), EFormMismatch);
    assert!(submission::form_id(submission) == bounty.form_id, EFormMismatch);

    let submitter = submission::submitter(submission);
    assert!(submitter != form_registry::owner(form), ESelfPayout);

    let submission_id = object::id(submission);
    assert!(!table::contains(&bounty.paid, submission_id), EAlreadyPaid);
    assert!((severity as u64) < NUM_TIERS, EBadSeverity);

    let amount = *vector::borrow(&bounty.tiers, severity as u64);

    // Record the payment even if amount is zero, so the same submission cannot
    // be "released" again at a higher tier later.
    table::add(&mut bounty.paid, submission_id, submitter);

    event::emit(BountyPaid {
        bounty_id: object::id(bounty),
        form_id: bounty.form_id,
        submission_id,
        recipient: submitter,
        severity,
        amount,
    });

    if (amount == 0) return;
    assert!(balance::value(&bounty.payout) >= amount, EInsufficientBalance);
    let payout = balance::split(&mut bounty.payout, amount);
    transfer::public_transfer(coin::from_balance(payout, ctx), submitter);
}

/// Sponsor reclaims unspent balance.
public fun withdraw_remaining<T>(bounty: &mut SponsoredBounty<T>, ctx: &mut TxContext) {
    assert!(bounty.sponsor == tx_context::sender(ctx), ENotSponsor);
    let amount = balance::value(&bounty.payout);
    let rest = balance::split(&mut bounty.payout, amount);
    event::emit(BountyWithdrawn {
        bounty_id: object::id(bounty),
        sponsor: bounty.sponsor,
        amount,
    });
    transfer::public_transfer(coin::from_balance(rest, ctx), bounty.sponsor);
}

public fun form_id<T>(b: &SponsoredBounty<T>): ID { b.form_id }
public fun sponsor_address<T>(b: &SponsoredBounty<T>): address { b.sponsor }
public fun remaining<T>(b: &SponsoredBounty<T>): u64 { balance::value(&b.payout) }
public fun tier_amount<T>(b: &SponsoredBounty<T>, severity: u8): u64 {
    assert!((severity as u64) < NUM_TIERS, EBadSeverity);
    *vector::borrow(&b.tiers, severity as u64)
}
public fun already_paid<T>(b: &SponsoredBounty<T>, submission_id: ID): bool {
    table::contains(&b.paid, submission_id)
}
