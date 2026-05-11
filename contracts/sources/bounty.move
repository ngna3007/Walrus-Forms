/// Sponsored bounty escrow for forms.
///
/// The type parameter is the payout coin type. Testnet demos can use SUI;
/// production WAL bounties use the WAL coin type when available.
module walrus_forms::bounty;

use sui::balance::{Self, Balance};
use sui::coin::{Self, Coin};
use sui::event;

const ENotSponsor: u64 = 1;
const EAlreadyReleased: u64 = 2;

public struct SponsoredBounty<phantom T> has key {
    id: UID,
    form_id: ID,
    sponsor: address,
    payout: Balance<T>,
    released: bool,
}

public struct BountySponsored has copy, drop {
    bounty_id: ID,
    form_id: ID,
    sponsor: address,
    amount: u64,
}

public struct BountyReleased has copy, drop {
    bounty_id: ID,
    form_id: ID,
    recipient: address,
    amount: u64,
}

public fun sponsor<T>(
    form_id: ID,
    payout: Coin<T>,
    ctx: &mut TxContext,
) {
    let amount = coin::value(&payout);
    let bounty = SponsoredBounty<T> {
        id: object::new(ctx),
        form_id,
        sponsor: tx_context::sender(ctx),
        payout: coin::into_balance(payout),
        released: false,
    };

    event::emit(BountySponsored {
        bounty_id: object::id(&bounty),
        form_id,
        sponsor: bounty.sponsor,
        amount,
    });

    transfer::share_object(bounty);
}

public fun release<T>(
    bounty: &mut SponsoredBounty<T>,
    recipient: address,
    ctx: &mut TxContext,
) {
    assert!(bounty.sponsor == tx_context::sender(ctx), ENotSponsor);
    assert!(!bounty.released, EAlreadyReleased);

    let amount = balance::value(&bounty.payout);
    let payout = balance::withdraw_all(&mut bounty.payout);
    bounty.released = true;

    event::emit(BountyReleased {
        bounty_id: object::id(bounty),
        form_id: bounty.form_id,
        recipient,
        amount,
    });

    transfer::public_transfer(coin::from_balance(payout, ctx), recipient);
}

public fun form_id<T>(bounty: &SponsoredBounty<T>): ID { bounty.form_id }
public fun sponsor_address<T>(bounty: &SponsoredBounty<T>): address { bounty.sponsor }
public fun released<T>(bounty: &SponsoredBounty<T>): bool { bounty.released }
