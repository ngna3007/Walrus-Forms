import type { SubmissionPayload, WebhookSettings } from "./types";

export interface WebhookDelivery {
  webhookId: string;
  status: "queued" | "sent" | "failed";
  target: string;
  message: string;
}

export function buildWebhookDeliveries(
  webhooks: WebhookSettings[] | undefined,
  payload: SubmissionPayload,
): WebhookDelivery[] {
  return (webhooks ?? [])
    .filter((hook) => hook.enabled)
    .map((hook) => ({
      webhookId: hook.id,
      status: "queued",
      target: hook.target,
      message: formatWebhookMessage(hook, payload),
    }));
}

function formatWebhookMessage(hook: WebhookSettings, payload: SubmissionPayload): string {
  const summary = Object.values(payload.values)
    .map((value) => {
      if (value.type === "text" || value.type === "url" || value.type === "dropdown") return value.value;
      if (value.type === "stars") return `${value.value} stars`;
      if (value.type === "checkbox") return value.value.join(", ");
      if (value.type === "file") return value.blobId;
      return "";
    })
    .filter(Boolean)
    .join(" | ")
    .slice(0, 220);
  return `[${hook.kind}] New Walrus Forms submission ${payload.formId}: ${summary}`;
}
