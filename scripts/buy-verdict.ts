// Buy a Verdict scorecard for any x402 service — demo CLI.
//   FREE_MODE=1 npx tsx scripts/buy-verdict.ts <endpoint> [name] [description]
// With AGENT_KEYS set and FREE_MODE off, the query is a real paid settlement.

import { generatePrivateKey } from "viem/accounts";
import { accountFromKey, fetchWithAgent } from "@relay/agent-kit";

const RELAY_URL = process.env.RELAY_URL ?? "http://localhost:8402";
const [endpoint = `${RELAY_URL}/s/echo`, name = "", description = ""] =
  process.argv.slice(2);

const key = process.env.AGENT_KEYS?.split(",")[0]?.trim() || generatePrivateKey();
const acct = accountFromKey(key);
console.log(`buyer:  ${acct.address}`);
console.log(`target: ${endpoint}\n`);

const r = await fetchWithAgent(`${RELAY_URL}/s/verdict`, acct, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ endpoint, name, description }),
});

if (r.status !== "success") {
  console.error("purchase failed:", r);
  process.exit(1);
}

const body = await r.response.json();
const card = body.result;
console.log(`VERDICT ${card.grade} · ${card.score}/100 · issuer ${card.issuer}`);
for (const e of card.evidence) {
  console.log(`  ${e.pass ? "✓" : "✗"} ${e.check}: ${e.detail}`);
}
console.log(`\nsigned: ${card.signature?.slice(0, 26)}…`);
console.log(`paid via x402: ${body.transaction ?? body.paid} ${r.txHash ? `(tx ${r.txHash})` : ""}`);
