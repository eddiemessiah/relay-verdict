// Register Relay + Verdict as ERC-8004 agents on Celo mainnet, so they
// appear on 8004scan.io/agents and other agents can discover, verify, and
// pay them. The registration JSON is embedded as a data: URI, so identity
// needs no external hosting to stay alive.
//
//   npx tsx scripts/register-8004.ts                    # dry run (prints URIs)
//   REGISTER=1 RELAY_KEY=0x… VERDICT_KEY=0x… \
//   RELAY_PUBLIC_URL=https://… PAYTO_ADDRESS=0x… npx tsx scripts/register-8004.ts
//
// Keys need a little CELO for gas. Both txs carry the attribution tag.

import { accountFromKey, registerAgent } from "@relay/agent-kit";
import type { AgentRegistration } from "@relay/agent-kit";

const RELAY_URL = process.env.RELAY_PUBLIC_URL ?? "https://relay-verdict.vercel.app";
const PAYTO = process.env.PAYTO_ADDRESS as `0x${string}` | undefined;

function dataUri(reg: AgentRegistration): string {
  return `data:application/json;base64,${Buffer.from(JSON.stringify(reg)).toString("base64")}`;
}

const relayReg: AgentRegistration = {
  type: "Agent",
  name: "Relay",
  description:
    "A2A x402 settlement rail + service marketplace on Celo. Agents discover metered services (GET /services), pay per call in USDC/USDT via x402, and list themselves (POST /agents/register, Verdict-gated).",
  endpoints: [
    { type: "http", url: `${RELAY_URL}/skill.md` },
    { type: "a2a", url: `${RELAY_URL}/.well-known/agent.json` },
    ...(PAYTO ? [{ type: "wallet" as const, address: PAYTO, chainId: 42220 }] : []),
  ],
  supportedTrust: ["reputation"],
};

const verdictReg = (issuer: `0x${string}`): AgentRegistration => ({
  type: "Agent",
  name: "Verdict",
  description:
    "Reputation oracle for the agent economy. Sells evidence-backed scores (live x402 probe + onchain footprint + quality review) per query at POST /s/verdict, and publishes them to the ERC-8004 Reputation Registry with tag1 'verdict'.",
  endpoints: [
    { type: "http", url: `${RELAY_URL}/skill.md` },
    { type: "wallet", address: issuer, chainId: 42220 },
  ],
  supportedTrust: ["reputation"],
});

const doIt = process.env.REGISTER === "1";

if (!doIt) {
  console.log("DRY RUN (set REGISTER=1 with funded RELAY_KEY / VERDICT_KEY to register)\n");
  console.log("Relay agentURI:\n " + dataUri(relayReg).slice(0, 120) + "…\n");
  console.log("Verdict agentURI:\n " + dataUri(verdictReg("0x0000000000000000000000000000000000000000")).slice(0, 120) + "…\n");
  console.log(JSON.stringify(relayReg, null, 2));
  process.exit(0);
}

const relayKey = process.env.RELAY_KEY;
const verdictKey = process.env.VERDICT_KEY;
if (!relayKey || !verdictKey) {
  console.error("REGISTER=1 requires RELAY_KEY and VERDICT_KEY (funded with a little CELO)");
  process.exit(1);
}

const relayAcct = accountFromKey(relayKey);
const verdictAcct = accountFromKey(verdictKey);

console.log(`Registering Relay   (owner ${relayAcct.address})…`);
const tx1 = await registerAgent(relayAcct, dataUri(relayReg));
console.log(`  ⛓ https://celoscan.io/tx/${tx1}`);

console.log(`Registering Verdict (owner ${verdictAcct.address})…`);
const tx2 = await registerAgent(verdictAcct, dataUri(verdictReg(verdictAcct.address)));
console.log(`  ⛓ https://celoscan.io/tx/${tx2}`);

console.log("\nDone. Both agents will appear on https://8004scan.io/agents (Celo).");
