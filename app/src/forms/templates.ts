import type { FormSchema } from "./types";

export interface FormTemplate {
  id: string;
  name: string;
  category: "feedback" | "bounty" | "grants" | "hiring";
  schema: FormSchema;
}

export const FORM_TEMPLATES: FormTemplate[] = [
  {
    id: "nps",
    name: "NPS",
    category: "feedback",
    schema: {
      version: 1,
      templateId: "nps",
      title: "Product NPS",
      description: "Measure loyalty and collect actionable product feedback.",
      fields: [
        { id: "score", type: "stars", label: "How likely are you to recommend us?", required: true, max: 10 },
        { id: "reason", type: "longText", label: "What is the main reason for your score?", required: true },
        { id: "contact", type: "shortText", label: "Contact", required: false },
      ],
    },
  },
  {
    id: "bug-bounty",
    name: "Bug bounty",
    category: "bounty",
    schema: {
      version: 1,
      templateId: "bug-bounty",
      title: "Bug Bounty Report",
      description: "Encrypted intake for reproducible vulnerability or product bug reports.",
      bounty: { enabled: true, tokenSymbol: "WAL", payoutAmount: "0" },
      requireWalletId: true,
      fields: [
        { id: "summary", type: "shortText", label: "Summary", required: true },
        { id: "description", type: "longText", label: "Bug description", required: true },
        { id: "repro", type: "richText", label: "Proof of concept", required: true },
        { id: "attachment", type: "screenshot", label: "Evidence", required: false },
      ],
    },
  },
  {
    id: "grant-application",
    name: "Grant application",
    category: "grants",
    schema: {
      version: 1,
      templateId: "grant-application",
      title: "Grant Application",
      description: "Review proposals with sealed submissions until the review window closes.",
      featureVoting: { enabled: true, quadratic: true },
      fields: [
        { id: "project", type: "shortText", label: "Project name", required: true },
        { id: "summary", type: "richText", label: "Proposal summary", required: true },
        { id: "budget", type: "shortText", label: "Requested budget", required: true },
        { id: "links", type: "url", label: "Project link", required: false },
      ],
    },
  },
  {
    id: "hiring",
    name: "Hiring",
    category: "hiring",
    schema: {
      version: 1,
      templateId: "hiring",
      title: "Candidate Application",
      description: "Structured application form with private attachments.",
      fields: [
        { id: "name", type: "shortText", label: "Name", required: true },
        { id: "role", type: "dropdown", label: "Role", required: true, options: ["Engineering", "Product", "Design", "Operations"] },
        { id: "portfolio", type: "url", label: "Portfolio or profile", required: false },
        { id: "why", type: "longText", label: "Why this role?", required: true },
      ],
    },
  },
];

export function cloneTemplateSchema(templateId: string): FormSchema | null {
  const template = FORM_TEMPLATES.find((item) => item.id === templateId);
  return template ? structuredClone(template.schema) : null;
}
