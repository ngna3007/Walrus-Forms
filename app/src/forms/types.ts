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
  payoutAmount: string;
  escrowObjectId?: string;
  resolutionNotes?: string;
}

export interface FeatureVotingSettings {
  enabled: boolean;
  quadratic: boolean;
  tokenGateObjectId?: string;
  votingObjectId?: string;
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
  submittedAt: number;
  values: Record<string, SubmissionValue>;
}
