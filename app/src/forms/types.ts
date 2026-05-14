export type FieldType =
  | "shortText"
  | "longText"
  | "richText"
  | "url"
  | "dropdown"
  | "checkbox"
  | "stars"
  | "screenshot"
  | "video";

export interface FormField {
  id: string;
  type: FieldType;
  label: string;
  required: boolean;
  /** For dropdown / checkbox. */
  options?: string[];
  /** For star ratings. */
  max?: number;
  helpText?: string;
}

export interface FormSchema {
  version: 1;
  title: string;
  description?: string;
  fields: FormField[];
  templateId?: string;
  integrations?: FormIntegrationSettings;
  bounty?: BountySettings;
  featureVoting?: FeatureVotingSettings;
  reputation?: ReputationSettings;
  /**
   * When true, the submitter's wallet address is recorded as the payload `submitter`.
   * When false (default), submissions are anonymous at the payload level — only
   * the on-chain tx sender remains (unavoidable, since gas pays it).
   */
  requireWalletId?: boolean;
}

export interface FormIntegrationSettings {
  webhooks?: WebhookSettings[];
}

export interface WebhookSettings {
  id: string;
  kind: "slack" | "discord" | "linear";
  target: string;
  enabled: boolean;
}

export interface BountySettings {
  enabled: boolean;
  tokenSymbol: "WAL" | "SUI";
  /**
   * Legacy single-tier amount. Kept for backwards-compat with v1 forms.
   * New forms write `tiers` instead. Reader code should prefer `tiers` if present.
   */
  payoutAmount?: string;
  /**
   * Severity-tiered payouts. Index 0 = Low, 1 = Medium, 2 = High, 3 = Critical.
   * Strings are human-readable token amounts (e.g. "0.5"), converted to MIST
   * via `parseTokenAmount` before being passed on chain.
   */
  tiers?: [string, string, string, string];
  escrowObjectId?: string;
  resolutionNotes?: string;
}

export interface FeatureVotingSettings {
  enabled: boolean;
  quadratic: boolean;
  tokenGateObjectId?: string;
  votingObjectId?: string;
}

export interface ReputationSettings {
  enabled: boolean;
}

export type SubmissionValue =
  | { type: "text"; value: string }
  | { type: "url"; value: string }
  | { type: "dropdown"; value: string }
  | { type: "checkbox"; value: string[] }
  | { type: "stars"; value: number }
  | { type: "file"; blobId: string; mimeType: string; encrypted: boolean };

export interface SubmissionPayload {
  version: 1;
  formId: string;
  submitter?: string;
  submittedAt: number;
  values: Record<string, SubmissionValue>;
}
