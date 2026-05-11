/// Roadmap voting board for feature-request submissions.
module walrus_forms::voting;

use sui::event;

const EZeroVotes: u64 = 1;

public struct VotingBoard has key {
    id: UID,
    form_id: ID,
    owner: address,
    quadratic: bool,
    total_weight: u64,
    votes: vector<Vote>,
}

public struct Vote has copy, drop, store {
    submission_id: ID,
    voter: address,
    votes: u64,
    weight: u64,
}

public struct VotingBoardCreated has copy, drop {
    board_id: ID,
    form_id: ID,
    owner: address,
    quadratic: bool,
}

public struct VoteCast has copy, drop {
    board_id: ID,
    form_id: ID,
    submission_id: ID,
    voter: address,
    votes: u64,
    weight: u64,
}

public fun create_board(form_id: ID, quadratic: bool, ctx: &mut TxContext) {
    let board = VotingBoard {
        id: object::new(ctx),
        form_id,
        owner: tx_context::sender(ctx),
        quadratic,
        total_weight: 0,
        votes: vector[],
    };

    event::emit(VotingBoardCreated {
        board_id: object::id(&board),
        form_id,
        owner: board.owner,
        quadratic,
    });

    transfer::share_object(board);
}

public fun vote(
    board: &mut VotingBoard,
    submission_id: ID,
    votes: u64,
    ctx: &TxContext,
) {
    assert!(votes > 0, EZeroVotes);
    let weight = if (board.quadratic) votes * votes else votes;
    board.total_weight = board.total_weight + weight;

    let record = Vote {
        submission_id,
        voter: tx_context::sender(ctx),
        votes,
        weight,
    };
    vector::push_back(&mut board.votes, record);

    event::emit(VoteCast {
        board_id: object::id(board),
        form_id: board.form_id,
        submission_id,
        voter: tx_context::sender(ctx),
        votes,
        weight,
    });
}

public fun form_id(board: &VotingBoard): ID { board.form_id }
public fun total_weight(board: &VotingBoard): u64 { board.total_weight }
public fun quadratic(board: &VotingBoard): bool { board.quadratic }
