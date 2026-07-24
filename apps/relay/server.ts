// Relay — the A2A x402 settlement rail + service directory (Flow B).
// A minimal, framework-free host: agents register metered services, other
// agents discover and pay for them via x402. Every paid call settles on-chain
// to PAYTO through the Celo facilitator — that settlement is the Track 2 unit.
//
// Run:  tsx apps/relay/server.ts   (see .env.example)
//   FREE_MODE=1 skips on-chain settlement so the loop is demoable without funds.

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  buildRequirements,
  paymentRequiredBody,
  verifyAndSettle,
  settlementResponseHeader,
} from "@relay/celo-pay/x402";
import { generatePrivateKey } from "viem/accounts";
import { accountFromKey } from "@relay/agent-kit";
import { scoreService } from "../verdict/oracle";

const PORT = Number(process.env.RELAY_PORT ?? 8402);
const PAYTO = (process.env.PAYTO_ADDRESS ?? "") as `0x${string}`;
const FREE_MODE = process.env.FREE_MODE === "1";

if (!FREE_MODE && !PAYTO) {
  console.error("PAYTO_ADDRESS required (or set FREE_MODE=1 for local demo)");
  process.exit(1);
}

// --- Verdict issuer identity -------------------------------------------------
// Signs every scorecard. Set VERDICT_KEY for a stable onchain identity;
// otherwise an ephemeral key is minted per boot (fine for free-mode demos).
const verdictAccount = accountFromKey(
  process.env.VERDICT_KEY ?? generatePrivateKey(),
);

// --- Event bus + SSE (feeds the live dashboard) ------------------------------
export interface RelayEvent {
  type: "settlement" | "call" | "scorecard" | "service_listed";
  at: number;
  data: Record<string, unknown>;
}

const eventLog: RelayEvent[] = [];
const sseClients = new Set<ServerResponse>();
const stats = { settlements: 0, volumeUsd: 0, calls: 0 };

function emit(type: RelayEvent["type"], data: Record<string, unknown>) {
  const ev: RelayEvent = { type, at: Date.now(), data };
  eventLog.push(ev);
  if (eventLog.length > 500) eventLog.shift();
  const wire = `data: ${JSON.stringify(ev)}\n\n`;
  for (const res of sseClients) res.write(wire);
}

// --- Service directory (in-memory; swap for Supabase in P2) ------------------
interface Service {
  id: string;
  name: string;
  description: string;
  priceUsd: string;
  handler: (body: any) => Promise<any> | any;
}

const services = new Map<string, Service>();

// Community listings: external x402 endpoints admitted via a live Verdict
// probe. Discovery-only — buyers pay the lister's endpoint directly, so the
// lister's revenue lands in their own payTo. Relay is storefront, not toll.
interface ExternalListing {
  id: string;
  name: string;
  description: string;
  priceUsd: string;
  endpoint: string;
  external: true;
  verdict: { score: number; grade: string; evidence: unknown[] };
  listedAt: number;
}
const externalListings = new Map<string, ExternalListing>();

function register(s: Service) {
  services.set(s.id, s);
  emit("service_listed", { id: s.id, name: s.name, priceUsd: s.priceUsd });
}

// Built-in demo services so the swarm always has real work to buy/sell.
register({
  id: "echo",
  name: "Echo",
  description: "Returns your payload. The simplest metered service.",
  priceUsd: "0.001",
  handler: (b) => ({ echo: b ?? null, at: Date.now() }),
});
register({
  id: "wordcount",
  name: "Word Count",
  description: "Counts words in { text }.",
  priceUsd: "0.001",
  handler: (b) => ({ words: String(b?.text ?? "").trim().split(/\s+/).filter(Boolean).length }),
});
register({
  id: "verdict",
  name: "Verdict Score",
  description:
    "Evidence-backed reputation score for an agent service: live x402 probe, onchain footprint on Celo, quality review. Signed by the Verdict oracle. Pass { endpoint, name?, description?, payTo? }.",
  priceUsd: "0.005",
  handler: async (b) => {
    const endpoint = String(b?.endpoint ?? "");
    if (!/^https?:\/\//.test(endpoint)) {
      return { error: "pass { endpoint: 'https://...' } to score a service" };
    }
    const card = await scoreService(
      {
        endpoint,
        name: b?.name,
        description: b?.description,
        payTo: b?.payTo,
      },
      verdictAccount,
    );
    emit("scorecard", { target: card.target, score: card.score, grade: card.grade });
    return card;
  },
});

// --- HTTP plumbing -----------------------------------------------------------
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
  });
}

function json(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  // CORS for the dashboard dev server.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-PAYMENT");
  res.setHeader("Access-Control-Expose-Headers", "X-PAYMENT-RESPONSE");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  // Agent discovery: identity manifest + skill file. Any agent that finds
  // this host (via ERC-8004 registration, 8004scan, or a shared link) can
  // learn how to buy, sell, and pay here without a human.
  if (req.method === "GET" && url.pathname === "/.well-known/agent.json") {
    const base = process.env.RELAY_PUBLIC_URL ?? `http://localhost:${PORT}`;
    return json(res, 200, {
      type: "Agent",
      name: "Relay",
      description:
        "A2A x402 settlement rail + service marketplace on Celo. Discover metered services via GET /services, pay per call with x402 (EIP-3009, USDC/USDT), list yourself via POST /agents/register (Verdict-gated).",
      endpoints: [
        { type: "http", url: `${base}/skill.md` },
        { type: "a2a", url: `${base}/.well-known/agent.json` },
        ...(PAYTO ? [{ type: "wallet", address: PAYTO, chainId: 42220 }] : []),
      ],
      supportedTrust: ["reputation"],
      verdictIssuer: verdictAccount.address,
    });
  }
  if (req.method === "GET" && url.pathname === "/skill.md") {
    const base = process.env.RELAY_PUBLIC_URL ?? `http://localhost:${PORT}`;
    res.writeHead(200, { "Content-Type": "text/markdown; charset=utf-8" });
    return res.end(
      [
        "# Relay — agent skill",
        "",
        "You are an AI agent. Relay is a live market on Celo: buy and sell metered services, pay per call with x402 stablecoin micropayments.",
        "",
        `- GET  ${base}/services — directory of buyable services`,
        `- POST ${base}/s/:id — call a service; 402 challenge -> sign EIP-3009 -> retry with X-PAYMENT header`,
        `- POST ${base}/agents/register — list yourself: { name, endpoint, description, priceUsd }. Verdict probes you live; score >= 40 gets listed.`,
        `- POST ${base}/s/verdict — buy a reputation score for any agent: { endpoint } ($0.005)`,
        "",
        "Network eip155:42220 (Celo). Facilitator https://x402.celo.org. USDC 0xcebA9300f2b948710d2653dD7B07f33A8B32118C, USDT 0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e.",
        "Reference payer client: https://github.com/eddiemessiah/relay-verdict/blob/main/packages/agent-kit/src/agent-x402.ts",
      ].join("\n"),
    );
  }

  // Live event stream for the dashboard.
  if (req.method === "GET" && url.pathname === "/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    // Replay recent history so the dashboard paints instantly.
    for (const ev of eventLog.slice(-50)) res.write(`data: ${JSON.stringify(ev)}\n\n`);
    sseClients.add(res);
    req.on("close", () => sseClients.delete(res));
    return;
  }

  // Aggregate stats for the dashboard counters.
  if (req.method === "GET" && url.pathname === "/stats") {
    return json(res, 200, {
      ...stats,
      services: services.size + externalListings.size,
      mode: FREE_MODE ? "free" : "live",
      payTo: PAYTO || null,
      verdictIssuer: verdictAccount.address,
    });
  }

  // Directory: what can I buy? (built-ins + Verdict-admitted community listings)
  if (req.method === "GET" && url.pathname === "/services") {
    return json(res, 200, {
      services: [
        ...[...services.values()].map(({ handler, ...s }) => ({
          ...s,
          endpoint: `/s/${s.id}`,
        })),
        ...[...externalListings.values()],
      ],
    });
  }

  // Bring-your-agent admission: Verdict probes the endpoint live; the
  // scorecard is the listing's trust badge. D or better gets listed.
  if (req.method === "POST" && url.pathname === "/agents/register") {
    const body = safeJson(await readBody(req)) as any;
    const name = String(body?.name ?? "").trim();
    const endpoint = String(body?.endpoint ?? "").trim();
    const description = String(body?.description ?? "").trim();
    if (!name || !/^https?:\/\//.test(endpoint)) {
      return json(res, 400, { error: "name and a valid http(s) endpoint are required" });
    }
    const card = await scoreService(
      { endpoint, name, description },
      verdictAccount,
    );
    if (card.score < 40) {
      return json(res, 422, {
        error: `Verdict admission failed: ${card.grade} · ${card.score}/100. Fix the evidence and resubmit.`,
        verdict: card,
      });
    }
    const id = `ext-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24)}`;
    const listing: ExternalListing = {
      id,
      name,
      description,
      priceUsd: String(body?.priceUsd ?? "?"),
      endpoint,
      external: true,
      verdict: { score: card.score, grade: card.grade, evidence: card.evidence },
      listedAt: Date.now(),
    };
    externalListings.set(id, listing);
    emit("service_listed", { id, name, external: true, verdict: listing.verdict });
    emit("scorecard", { target: endpoint, score: card.score, grade: card.grade });
    return json(res, 200, { listed: true, id, verdict: card });
  }

  // Metered service call: POST /s/:id
  const m = url.pathname.match(/^\/s\/([\w-]+)$/);
  if (req.method === "POST" && m) {
    const svc = services.get(m[1]);
    if (!svc) return json(res, 404, { error: "no such service" });

    const bodyRaw = await readBody(req);
    const body = bodyRaw ? safeJson(bodyRaw) : undefined;
    const resource = `${url.origin}${url.pathname}`;
    const accepts = buildRequirements({
      priceUsd: svc.priceUsd,
      payTo: PAYTO || "0x0000000000000000000000000000000000000000",
      resource,
      description: svc.description,
    });

    const paymentHeader = req.headers["x-payment"] as string | undefined;
    if (!paymentHeader) {
      return json(res, 402, paymentRequiredBody(accepts));
    }

    stats.calls++;
    emit("call", { service: svc.id });

    if (FREE_MODE) {
      // Demo without funds: honor the request, return a mock receipt.
      const out = await svc.handler(body);
      stats.settlements++;
      stats.volumeUsd += Number(svc.priceUsd);
      emit("settlement", {
        service: svc.id,
        priceUsd: svc.priceUsd,
        payer: "free-mode",
        transaction: "0xFREE",
        mode: "free",
      });
      return json(res, 200, { result: out, paid: "free-mode" }, {
        "X-PAYMENT-RESPONSE": settlementResponseHeader({ ok: true, transaction: "0xFREE" }),
      });
    }

    const settle = await verifyAndSettle(paymentHeader, accepts);
    if (!settle.ok) return json(res, 402, { error: settle.error });

    const out = await svc.handler(body);
    stats.settlements++;
    stats.volumeUsd += Number(svc.priceUsd);
    emit("settlement", {
      service: svc.id,
      priceUsd: svc.priceUsd,
      payer: settle.payer,
      transaction: settle.transaction,
      mode: "live",
    });
    return json(res, 200, { result: out, payer: settle.payer, transaction: settle.transaction }, {
      "X-PAYMENT-RESPONSE": settlementResponseHeader(settle),
    });
  }

  return json(res, 404, { error: "not found" });
});

function safeJson(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

server.listen(PORT, () => {
  console.log(
    `Relay listening on :${PORT}  (${FREE_MODE ? "FREE MODE — no settlement" : `payTo ${PAYTO}`})`,
  );
  console.log(`  GET  /services`);
  for (const s of services.values()) console.log(`  POST /s/${s.id}  $${s.priceUsd}`);
});
