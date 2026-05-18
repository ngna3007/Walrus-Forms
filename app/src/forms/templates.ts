import type { FormSchema } from "./types";

export interface FormTemplate {
  id: string;
  name: string;
  category: "feedback" | "bounty" | "grants" | "hiring" | "sessions";
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
    id: "walrus-session-2",
    name: "Walrus Session 2 - Form Tooling",
    category: "sessions",
    schema: {
      version: 1,
      templateId: "walrus-session-2",
      title: "Walrus Session 2 - Form Tooling",
      description: "Please use this form to register your form project.",
      requireWalletId: true,
      fields: [
        { id: "project_name", type: "shortText", label: "Project name", required: true },
        { id: "session", type: "dropdown", label: "Please select the session", required: true, options: ["Session 1", "Session 2", "Session 3"] },
        { id: "leader_name", type: "shortText", label: "Team Leader Name", required: true },
        { id: "leader_email", type: "shortText", label: "Team Leader Email", required: true },
        { id: "newsletter", type: "checkbox", label: "Check this if you would be open to receiving our newsletter", required: false, options: ["Yes, I'd like to receive the newsletter"] },
        { id: "leader_telegram", type: "shortText", label: "Team Leader Telegram Handle", required: false },
        { id: "discord", type: "shortText", label: "Discord handle", required: true, helpText: "Make sure to join our discord since it is required and it is a way for us to contact you. https://discord.gg/walrusprotocol" },
        { id: "country", type: "shortText", label: "Country", required: true },
        { id: "deepsurge_link", type: "url", label: "DeepSurge project Link", required: true, helpText: "Needs to be on mainnet" },
        { id: "form_link", type: "url", label: "Form Link", required: true },
        { id: "confirm_submission", type: "checkbox", label: "I confirm that I have submitted at least one feedback entry through the form tool I built, which includes the same fields as this form. Please make 0xc4d6ee019649edba41d5a5ed1081fe3c86afc41fea413195dd6ecdd0f6090e54 an admin so it can review the application and add other admins.", required: true, options: ["I confirm"] },
        { id: "workflow", type: "richText", label: "Please describe the workflow and functionalities of your forms", required: true, helpText: "E.g.\nAdmin flow: create a form, update form, review replies\nUser flow: Submit a form" },
        { id: "visuals", type: "screenshot", label: "Share any visuals of your form", required: true, helpText: "You can upload screenshots, designs, workflow" },
        { id: "demo_video", type: "video", label: "Demo video of the form (sub 3 minutes)", required: true },
        { id: "differentiators", type: "longText", label: "Which features sets your solution apart from the rest?", required: true },
        { id: "feedback_walrus", type: "longText", label: "Feedback (about building on Walrus)", required: true, helpText: "This can include but not limited to:\n- What worked well\n- Any challenges you encountered (e.g. documentation, tooling, infrastructure)\n- Missing features or functionalities you would like to see\n- Issues with access (e.g. testnet tokens, setup, onboarding)\n- Suggestions for improving the developer experience" },
        { id: "x_account", type: "shortText", label: "X account", required: false, helpText: "By providing your account, you agree that we may tag you in the winner announcement." },
        { id: "x_tweet", type: "url", label: "Share link to X tweet", required: true },
        { id: "sui_address", type: "shortText", label: "SUI address", required: true },
        { id: "github", type: "url", label: "GitHub", required: true, helpText: "Paste a link to your GitHub profiles and relevant repositories." },
        { id: "session_feedback", type: "longText", label: "Session Feedback", required: false, helpText: "Share any thoughts on the sessions, what worked, what didn't, or what could be improved. This feedback is only used to improve future sessions and has no impact on rewards or participation." },
        { id: "deepsurge_feedback", type: "longText", label: "DeepSurge Feedback", required: false, helpText: "Share any thoughts on DeepSurge, what worked, what didn't, or what could be improved. This feedback is only used to improve future DeepSurge and has no impact on rewards or participation." },
        { id: "rules_confirm", type: "checkbox", label: "I confirm that I have read, understood, and agree to the rules and regulations of the session.", required: true, helpText: "https://thewalrussessions.wal.app/", options: ["I agree"] },
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
