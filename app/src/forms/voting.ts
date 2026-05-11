export interface VoteState {
  creditsSpent: number;
  votes: number;
}

export function votesFromCredits(credits: number): number {
  return Math.floor(Math.sqrt(Math.max(0, credits)));
}

export function creditsForVotes(votes: number): number {
  return Math.max(0, votes) ** 2;
}
