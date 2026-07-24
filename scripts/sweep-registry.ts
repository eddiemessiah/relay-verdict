// Verdict sweeps the ERC-8004 registry on Celo — the Aigora integration.
//
//   npx tsx scripts/sweep-registry.ts 12 34 56       # score agentIds 12, 34, 56
//   PUBLISH=1 VERDICT_KEY=0x... npx tsx ...          # also write giveFeedback onchain
//
// For each agentId: read tokenURI from the Identity Registry → parse the
// registration JSON → find an http/a2a/mcp endpoint → run the full Verdict
// probe → print the scorecard. With PUBLISH=1 and a funded VERDICT_KEY, the
// score lands in the Reputation Registry (tag1 "verdict") — the same score
// surface Aigora reads when agents bid on tasks. Every publish is a tagged
// Celo transaction.

import { generatePrivateKey } from "viem/accounts";
import {
  accountFromKey,
  fetchRegistration,
  publishScoreOnchain,
  readVerdictSummary,
} from "@relay/agent-kit";
import { scoreService } from "../apps/verdict/oracle";

async function hygieneCard(
  reg: { name: string; description: string; endpoints?: unknown[] },
  wallet: `0x${string}` | undefined,
  target: string,
) {
  const { publicClient } = await import("@relay/agent-kit");
  const evidence = [
    {
      check: "registration-readable",
      pass: true,
      detail: "tokenURI resolves to valid registration JSON",
      weight: 30,
    },
    {
      check: "service-endpoint-declared",
      pass: false,
      detail: "no probeable http/a2a/mcp endpoint in registration",
      weight: 40,
    },
    {
      check: "wallet-declared",
      pass: !!wallet,
      detail: wallet ? `wallet ${wallet}` : "no wallet endpoint declared",
      weight: 15,
    },
    {
      check: "description-quality",
      pass: (reg.description ?? "").length >= 20,
      detail:
        (reg.description ?? "").length >= 20
          ? "description states capabilities"
          : "description missing or too vague",
      weight: 15,
    },
  ];
  if (wallet) {
    try {
      const nonce = await publicClient.getTransactionCount({ address: wallet });
      evidence[2].detail += nonce > 0 ? ` · ${nonce} tx onchain` : " · never transacted";
    } catch {}
  }
  const max = evidence.reduce((s, e) => s + e.weight, 0);
  const got = evidence.reduce((s, e) => s + (e.pass ? e.weight : 0), 0);
  const score = Math.round((got / max) * 100);
  const grade = score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 40 ? "D" : "F";
  return {
    target,
    score,
    grade: grade as "A" | "B" | "C" | "D" | "F",
    evidence,
    issuedAt: new Date().toISOString(),
    issuer: issuer.address,
  };
}

const ids = process.argv.slice(2).map((x) => BigInt(x));
if (ids.length === 0) {
  console.error("usage: npx tsx scripts/sweep-registry.ts <agentId> [agentId...]");
  process.exit(1);
}

const PUBLISH = process.env.PUBLISH === "1";
const issuer = accountFromKey(process.env.VERDICT_KEY ?? generatePrivateKey());
console.log(`Verdict issuer: ${issuer.address}${PUBLISH ? " (publishing onchain)" : " (dry run)"}\n`);

for (const agentId of ids) {
  console.log(`── agent #${agentId} ──────────────────────────────`);
  const { uri, registration } = await fetchRegistration(agentId);
  if (!registration) {
    console.log(`  registration unreadable (${uri.slice(0, 60)}…) — skipping\n`);
    continue;
  }
  console.log(`  name: ${registration.name}`);

  const svcEndpoint = registration.endpoints?.find(
    (e): e is { type: "a2a" | "mcp" | "http"; url: string } =>
      "url" in e && /^https?:\/\//.test(e.url),
  );
  const wallet = registration.endpoints?.find(
    (e): e is { type: "wallet"; address: `0x${string}`; chainId: number } =>
      e.type === "wallet",
  );
  // No live endpoint? Still scoreable: registration hygiene is itself signal
  // (most registry entries fail even this — localhost URLs, placeholders).
  const card = svcEndpoint
    ? await scoreService(
        {
          endpoint: svcEndpoint.url,
          name: registration.name,
          description: registration.description,
          payTo: wallet?.address,
        },
        issuer,
      )
    : await hygieneCard(registration, wallet?.address, `erc8004:${agentId}`);
  console.log(`  VERDICT ${card.grade} · ${card.score}/100`);
  for (const e of card.evidence) {
    console.log(`    ${e.pass ? "✓" : "✗"} ${e.check}: ${e.detail}`);
  }

  if (PUBLISH) {
    const tx = await publishScoreOnchain(issuer, {
      agentId,
      score: card.score,
      grade: card.grade,
      endpoint: svcEndpoint?.url ?? "",
      feedbackURI: "", // TODO: pin full card to IPFS and reference it here
      scorecardJson: JSON.stringify(card),
    });
    console.log(`  ⛓ published: https://celoscan.io/tx/${tx}`);
    const summary = await readVerdictSummary(agentId);
    console.log(`  onchain verdict summary: ${summary.count} review(s)`);
  }
  console.log();
}
