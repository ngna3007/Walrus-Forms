import http from "node:http";

const PORT = Number(process.env.PORT ?? 8787);

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    return sendJson(res, 200, { ok: true });
  }

  if (req.method !== "POST" || req.url !== "/webhooks/forward") {
    return sendJson(res, 404, { error: "not_found" });
  }

  try {
    const body = await readJson(req);
    const deliveries = Array.isArray(body.deliveries) ? body.deliveries : [];
    const results = [];

    for (const delivery of deliveries) {
      results.push(await forward(delivery));
    }

    sendJson(res, 200, { results });
  } catch (err) {
    sendJson(res, 400, { error: err instanceof Error ? err.message : String(err) });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`webhook-forwarder listening on http://127.0.0.1:${PORT}`);
});

async function forward(delivery) {
  const kind = String(delivery.kind ?? "");
  const target = String(delivery.target ?? "");
  const message = String(delivery.message ?? "");

  if (!target || !message) {
    return { webhookId: delivery.webhookId, status: "failed", error: "missing target or message" };
  }

  if (kind === "slack") return postJson(delivery, target, { text: message });
  if (kind === "discord") return postJson(delivery, target, { content: message });
  if (kind === "linear") return createLinearIssue(delivery, target, message);

  return { webhookId: delivery.webhookId, status: "failed", error: `unsupported kind: ${kind}` };
}

async function postJson(delivery, url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  return {
    webhookId: delivery.webhookId,
    status: response.ok ? "sent" : "failed",
    statusCode: response.status,
  };
}

async function createLinearIssue(delivery, teamKey, message) {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) {
    return { webhookId: delivery.webhookId, status: "failed", error: "LINEAR_API_KEY missing" };
  }

  const query = `
    mutation IssueCreate($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue { id identifier url }
      }
    }
  `;

  const response = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      "authorization": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      query,
      variables: {
        input: {
          teamId: teamKey,
          title: "Walrus Forms submission",
          description: message,
        },
      },
    }),
  });

  const json = await response.json().catch(() => null);
  return {
    webhookId: delivery.webhookId,
    status: response.ok && json?.data?.issueCreate?.success ? "sent" : "failed",
    statusCode: response.status,
    issue: json?.data?.issueCreate?.issue,
    error: json?.errors?.[0]?.message,
  };
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}
