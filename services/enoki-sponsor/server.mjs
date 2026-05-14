import http from "node:http";
import { EnokiClient } from "@mysten/enoki";

const PORT = Number(process.env.PORT || process.env.ENOKI_SPONSOR_PORT || 8787);
const HOST = process.env.HOST || "127.0.0.1";
const NETWORK = process.env.ENOKI_NETWORK || "testnet";
const API_KEY = process.env.ENOKI_PRIVATE_API_KEY;
const PACKAGE_ID = process.env.PACKAGE_ID || process.env.VITE_PACKAGE_ID || "";

const client = API_KEY ? new EnokiClient({ apiKey: API_KEY }) : null;

const configuredTargets = csv(process.env.ENOKI_ALLOWED_MOVE_CALL_TARGETS);
const defaultTargets = PACKAGE_ID
  ? [`${PACKAGE_ID}::submission::submit`, `${PACKAGE_ID}::reputation::create`]
  : [];
const sponsorAllowedMoveCallTargets = configuredTargets.length ? configuredTargets : defaultTargets;
const configuredAddresses = csv(process.env.ENOKI_ALLOWED_ADDRESSES);

const server = http.createServer(async (request, response) => {
  try {
    setCors(response);

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `${HOST}:${PORT}`}`);

    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, {
        ok: true,
        network: NETWORK,
        sponsorConfigured: Boolean(client),
        allowedMoveCallTargets: sponsorAllowedMoveCallTargets,
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/enoki/sponsor") {
      assertConfigured();
      const body = await readJson(request);
      const transactionKindBytes = requireString(body.transactionBlockKindBytes, "transactionBlockKindBytes");
      const sender = requireString(body.sender, "sender");
      const requestedTargets = stringArray(body.allowedMoveCallTargets);
      const allowedMoveCallTargets = selectMoveCallTargets(requestedTargets);
      const allowedAddresses = unique([
        ...configuredAddresses,
        ...stringArray(body.allowedAddresses),
        sender,
      ]).filter(isSuiAddressLike);

      const sponsored = await client.createSponsoredTransaction({
        network: normalizeNetwork(body.network),
        transactionKindBytes,
        sender,
        allowedMoveCallTargets,
        allowedAddresses,
      });

      sendJson(response, 200, sponsored);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/enoki/execute") {
      assertConfigured();
      const body = await readJson(request);
      const digest = requireString(body.digest, "digest");
      const signature = requireString(body.signature, "signature");
      const result = await client.executeSponsoredTransaction({ digest, signature });
      sendJson(response, 200, result);
      return;
    }

    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    sendJson(response, status, { error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Enoki sponsor service listening on http://${HOST}:${PORT}`);
  if (!API_KEY) console.warn("ENOKI_PRIVATE_API_KEY is not set. Sponsor endpoints will return 500.");
  if (!sponsorAllowedMoveCallTargets.length) {
    console.warn("No allowed Move call targets configured. Set PACKAGE_ID or ENOKI_ALLOWED_MOVE_CALL_TARGETS.");
  }
});

function assertConfigured() {
  if (!client) throw new HttpError(500, "ENOKI_PRIVATE_API_KEY is not configured.");
  if (!sponsorAllowedMoveCallTargets.length) {
    throw new HttpError(500, "No sponsor allowlist configured. Set PACKAGE_ID or ENOKI_ALLOWED_MOVE_CALL_TARGETS.");
  }
}

function selectMoveCallTargets(requestedTargets) {
  const allowed = new Set(sponsorAllowedMoveCallTargets);
  const requested = requestedTargets.length ? requestedTargets : sponsorAllowedMoveCallTargets;
  const rejected = requested.filter((target) => !allowed.has(target));
  if (rejected.length) {
    throw new HttpError(403, `Move call target is not sponsor-allowed: ${rejected.join(", ")}`);
  }
  return requested;
}

function normalizeNetwork(value) {
  const network = typeof value === "string" ? value : NETWORK;
  if (network === "testnet" || network === "mainnet" || network === "devnet") return network;
  throw new HttpError(400, "network must be testnet, mainnet, or devnet");
}

async function readJson(request) {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 1_000_000) throw new HttpError(413, "Request body too large.");
  }
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw new HttpError(400, "Invalid JSON body.");
  }
}

function requireString(value, name) {
  if (typeof value !== "string" || !value) throw new HttpError(400, `${name} is required.`);
  return value;
}

function stringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item) : [];
}

function csv(value) {
  return typeof value === "string"
    ? value.split(",").map((item) => item.trim()).filter(Boolean)
    : [];
}

function unique(values) {
  return [...new Set(values)];
}

function isSuiAddressLike(value) {
  return /^0x[0-9a-fA-F]{1,64}$/.test(value);
}

function setCors(response) {
  response.setHeader("Access-Control-Allow-Origin", process.env.CORS_ORIGIN || "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(payload));
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
