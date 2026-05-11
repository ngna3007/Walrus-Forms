export type SubmissionStatus = 0 | 1 | 2 | 3;

export interface IndexedSubmission {
  submissionId: string;
  formId: string;
  submitter: string;
  status: SubmissionStatus;
  submittedAtMs: number;
  blobId: string;
  fileBlobIds: string[];
}

export interface IndexedReputation {
  submitter: string;
  submissions: number;
  resolved: number;
  score: number;
  reputationObjectId?: string;
}

export interface IndexedBounty {
  bountyId: string;
  formId: string;
  sponsor: string;
  tokenType: string;
  amount: string;
  released: boolean;
  recipient?: string;
}

export interface SubmissionSearchParams {
  formId: string;
  status?: SubmissionStatus;
  query?: string;
  cursor?: string;
}
