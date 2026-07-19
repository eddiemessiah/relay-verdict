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

const PORT = Number(process.env.RELAY_PORT ?? 8402);
const PAYTO = (process.env.PAYTO_ADDRESS ?? "") as `0x${string}`;
const FREE_MODE = process.env.FREE_MODE === "1";

if (!FREE_MODE && !PAYTO) {
  console.error("PAYTO_ADDRESS required (or set FREE_MODE=1 for local demo)");
  process.exit(1);
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

function register(s: Service) {
  services.set(s.id, s);
}

// Built-in demo services so the swarm always has real work to buy/sell.
register({
  id: "echo",
  name: "Echo",
  description: "Returns your payload — the simplest metered service.",
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
  id: "score",
  name: "Verdict Score (stub)",
  description: "Reputation score for { agentId } — see apps/verdict for the real oracle.",
  priceUsd: "0.002",
  handler: (b) => ({ agentId: b?.agentId ?? null, score: 50 + Math.floor(Math.random() * 50), evidence: "stub" }),
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

  // Directory: what can I buy?
  if (req.method === "GET" && url.pathname === "/services") {
    return json(res, 200, {
      services: [...services.values()].map(({ handler, ...s }) => ({
        ...s,
        endpoint: `/s/${s.id}`,
      })),
    });
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

    if (FREE_MODE) {
      // Demo without funds: honor the request, return a mock receipt.
      const out = await svc.handler(body);
      return json(res, 200, { result: out, paid: "free-mode" }, {
        "X-PAYMENT-RESPONSE": settlementResponseHeader({ ok: true, transaction: "0xFREE" }),
      });
    }

    const settle = await verifyAndSettle(paymentHeader, accepts);
    if (!settle.ok) return json(res, 402, { error: settle.error });

    const out = await svc.handler(body);
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
