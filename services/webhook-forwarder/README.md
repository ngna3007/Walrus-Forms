# Walrus Forms Webhook Forwarder

Small HTTP worker for forwarding decrypted submission summaries to Slack,
Discord, and Linear.

## Run

```bash
PORT=8787 LINEAR_API_KEY=lin_api_... node server.mjs
```

## Endpoint

`POST /webhooks/forward`

```json
{
  "deliveries": [
    {
      "webhookId": "slack-prod",
      "kind": "slack",
      "target": "https://hooks.slack.com/services/...",
      "message": "New submission..."
    }
  ]
}
```

Slack and Discord use incoming webhook URLs as `target`. Linear uses a team key
as `target` and requires `LINEAR_API_KEY`.
