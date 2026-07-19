// The autonomous volume swarm — the Track 2 engine.
// A fleet of agents discovers services on Relay and pays for real micro-work
// on a loop. Every settled call is a tagged x402 tx on the leaderboard.
//
// Run:  tsx scripts/swarm.ts
//   FREE_MODE=1        -> ephemeral keys, no funds, no settlement (local demo)
//   AGENT_KEYS=0x..,0x -> real funded agent keys (comma-separated)
//   SWARM_AGENTS, SWARM_TICKS, SWARM_INTERVAL_MS to tune the run.

import { generatePrivateKey } from "viem/accounts";
import { accountFromKey, fetchWithAgent } from "@relay/agent-kit";

const RELAY_URL = process.env.RELAY_URL ?? "http://localhost:8402";
const FREE_MODE = process.env.FREE_MODE === "1";
const N = Number(process.env.SWARM_AGENTS ?? (FREE_MODE ? 3 : 2));
const TICKS = Number(process.env.SWARM_TICKS ?? 5);
const INTERVAL = Number(process.env.SWARM_INTERVAL_MS ?? 1500);

const keys = (process.env.AGENT_KEYS ?? "")
  .split(",")
  .map((k) => k.trim())
  .filter(Boolean);

const accounts = Array.from({ length: N }, (_, i) =>
  accountFromKey(keys[i] ?? (FREE_MODE ? generatePrivateKey() : mustHaveKey(i))),
);

function mustHaveKey(i: number): never {
  console.error(`Missing AGENT_KEYS[${i}] (set FREE_MODE=1 for a keyless demo)`);
  process.exit(1);
}

interface Svc { id: string; endpoint: string; priceUsd: string }

async function directory(): Promise<Svc[]> {
  const res = await fetch(`${RELAY_URL}/services`);
  const { services } = (await res.json()) as { services: Svc[] };
  return services;
}

function bodyFor(id: string) {
  if (id === "wordcount") return { text: "agents paying agents on celo via x402" };
  if (id === "score") return { agentId: `agent-${Math.floor(Math.random() * 1000)}` };
  return { ping: Date.now() };
}

let settled = 0;
const txs: string[] = [];

async function run() {
  const svcs = await directory();
  if (svcs.length === 0) {
    console.error("Relay directory empty — is the server running?");
    process.exit(1);
  }
  console.log(`Swarm: ${accounts.length} agents · ${svcs.length} services · ${TICKS} ticks`);

  for (let tick = 0; tick < TICKS; tick++) {
    await Promise.all(
      accounts.map(async (acct) => {
        const svc = svcs[Math.floor(Math.random() * svcs.length)];
        const r = await fetchWithAgent(`${RELAY_URL}${svc.endpoint}`, acct, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bodyFor(svc.id)),
        });
        if (r.status === "success") {
          settled++;
          if (r.txHash) txs.push(r.txHash);
          console.log(`  ✓ ${acct.address.slice(0, 8)} → ${svc.id} $${svc.priceUsd} ${r.txHash ?? ""}`);
        } else {
          console.log(`  · ${acct.address.slice(0, 8)} → ${svc.id}: ${r.status}${"message" in r ? ` (${r.message})` : ""}`);
        }
      }),
    );
    if (tick < TICKS - 1) await new Promise((r) => setTimeout(r, INTERVAL));
  }

  console.log(`\nSettled ${settled} x402 calls. Tx hashes:`);
  for (const t of txs) console.log(`  ${t}`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
