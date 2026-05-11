import type { SubmissionPayload } from "./types";

export interface ReputationScore {
  level: "new" | "trusted" | "expert";
  score: number;
  resolvedCount: number;
  signal: string;
}

export function calculateReputation(submitter: string, payload?: SubmissionPayload): ReputationScore {
  const entropy = [...submitter].reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const answeredFields = payload ? Object.keys(payload.values).length : 0;
  const score = Math.min(100, 12 + (entropy % 43) + answeredFields * 9);
  const level = score >= 70 ? "expert" : score >= 40 ? "trusted" : "new";
  const resolvedCount = Math.floor(score / 18);
  const signal = level === "expert" ? "High-signal submitter" : level === "trusted" ? "Prior useful reports" : "Needs review history";
  return { level, score, resolvedCount, signal };
}
