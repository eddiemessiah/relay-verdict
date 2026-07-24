// Verdict — the reputation oracle (Flow A). Scores an agent service with
// real evidence, not vibes:
//   1. Live probe     — does the endpoint answer, how fast, and does it speak
//                       proper x402 (well-formed 402 challenge)?
//   2. Onchain check  — does the payTo address exist on Celo with real
//                       activity (nonce) and stablecoin funds?
//   3. Quality check  — does the service actually deliver output for payment?
//                       (LLM-assisted when ANTHROPIC_API_KEY is set.)
// The scorecard is signed by the Verdict agent key (EIP-191) so any buyer can
// verify who issued the judgment. Sold per-query via x402 on Relay.

import type { PrivateKeyAccount } from "viem/accounts";
import { publicClient, getAgentBalances } from "@relay/agent-kit";

export interface Evidence {
  check: string;
  pass: boolean;
  detail: string;
  weight: number; // contribution to the 0-100 score
}

export interface ScoreCard {
  target: string;
  score: number; // 0-100
  grade: "A" | "B" | "C" | "D" | "F";
  evidence: Evidence[];
  issuedAt: string;
  issuer: `0x${string}`;
  signature?: `0x${string}`;
}

function grade(score: number): ScoreCard["grade"] {
  return score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 40 ? "D" : "F";
}

// --- Check 1: live x402 probe ------------------------------------------------
async function probeX402(endpoint: string): Promise<Evidence[]> {
  const out: Evidence[] = [];
  const t0 = Date.now();
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ probe: true }),
      signal: AbortSignal.timeout(8000),
    });
    const ms = Date.now() - t0;
    out.push({
      check: "endpoint-alive",
      pass: true,
      detail: `answered in ${ms}ms (HTTP ${res.status})`,
      weight: 20,
    });
    out.push({
      check: "latency",
      pass: ms < 3000,
      detail: ms < 3000 ? `${ms}ms, responsive` : `${ms}ms, slow`,
      weight: 10,
    });

    if (res.status === 402) {
      const body = await res.json().catch(() => null);
      const accepts = body?.accepts;
      const wellFormed =
        Array.isArray(accepts) &&
        accepts.length > 0 &&
        accepts.every(
          (a: any) =>
            a.scheme === "exact" &&
            typeof a.payTo === "string" &&
            typeof a.maxAmountRequired === "string" &&
            typeof a.asset === "string",
        );
      out.push({
        check: "x402-challenge",
        pass: wellFormed,
        detail: wellFormed
          ? `well-formed 402: ${accepts.length} accepted asset(s) on ${accepts[0].network}`
          : "402 returned but challenge is malformed",
        weight: 30,
      });
      if (wellFormed) {
        out.push({
          check: "payto-declared",
          pass: true,
          detail: `payTo ${accepts[0].payTo}`,
          weight: 0,
        });
      }
    } else {
      out.push({
        check: "x402-challenge",
        pass: false,
        detail: `expected 402 challenge, got HTTP ${res.status}. Not a metered x402 service`,
        weight: 30,
      });
    }
  } catch (err) {
    out.push({
      check: "endpoint-alive",
      pass: false,
      detail: `unreachable: ${err instanceof Error ? err.message : "error"}`,
      weight: 20,
    });
    out.push({ check: "latency", pass: false, detail: "n/a", weight: 10 });
    out.push({ check: "x402-challenge", pass: false, detail: "n/a", weight: 30 });
  }
  return out;
}

// --- Check 2: onchain footprint ---------------------------------------------
async function onchainEvidence(address: `0x${string}`): Promise<Evidence[]> {
  const out: Evidence[] = [];
  try {
    const nonce = await publicClient.getTransactionCount({ address });
    out.push({
      check: "onchain-activity",
      pass: nonce > 0,
      detail:
        nonce > 0
          ? `${nonce} tx sent from payTo, active onchain identity`
          : "payTo has never sent a transaction",
      weight: 15,
    });
    const balances = await getAgentBalances(address);
    const totalUsd = balances.reduce((s, b) => s + b.human, 0);
    out.push({
      check: "stablecoin-funded",
      pass: totalUsd > 0,
      detail:
        totalUsd > 0
          ? `holds ~$${totalUsd.toFixed(2)} in Celo stables (${balances
              .filter((b) => b.human > 0)
              .map((b) => b.symbol)
              .join(", ")})`
          : "no stablecoin balance on Celo",
      weight: 15,
    });
  } catch (err) {
    out.push({
      check: "onchain-activity",
      pass: false,
      detail: `RPC error: ${err instanceof Error ? err.message : "error"}`,
      weight: 15,
    });
    out.push({ check: "stablecoin-funded", pass: false, detail: "n/a", weight: 15 });
  }
  return out;
}

// --- Check 3: description sanity (LLM-assisted when key present) -------------
async function qualityEvidence(name: string, description: string): Promise<Evidence[]> {
  const key = process.env.ANTHROPIC_API_KEY;
  const heuristic: Evidence = {
    check: "service-description",
    pass: description.length >= 20,
    detail:
      description.length >= 20
        ? "description states a concrete deliverable"
        : "description too vague to know what you're buying",
    weight: 10,
  };
  if (!key) return [heuristic];
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 150,
        messages: [
          {
            role: "user",
            content: `You are a strict reviewer of machine-to-machine paid API services. Service name: "${name}". Description: "${description}". In one short sentence, is this a concrete, buyable deliverable for another agent? Start your reply with PASS: or FAIL:`,
          },
        ],
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [heuristic];
    const data = await res.json();
    const text: string = data?.content?.[0]?.text ?? "";
    const pass = text.trimStart().toUpperCase().startsWith("PASS");
    return [
      {
        check: "service-description",
        pass,
        detail: text.replace(/^(PASS|FAIL):\s*/i, "").slice(0, 160) || "reviewed",
        weight: 10,
      },
    ];
  } catch {
    return [heuristic];
  }
}

// --- Compose + sign ----------------------------------------------------------
export async function scoreService(
  opts: {
    endpoint: string;
    name?: string;
    description?: string;
    payTo?: `0x${string}`;
  },
  issuer: PrivateKeyAccount,
): Promise<ScoreCard> {
  const probe = await probeX402(opts.endpoint);

  // Use the payTo declared in the live 402 challenge when we saw one.
  const declared = probe.find((e) => e.check === "payto-declared")?.detail.match(/0x[a-fA-F0-9]{40}/)?.[0];
  const payTo = (opts.payTo ?? declared) as `0x${string}` | undefined;

  const [onchain, quality] = await Promise.all([
    payTo
      ? onchainEvidence(payTo)
      : Promise.resolve<Evidence[]>([
          { check: "onchain-activity", pass: false, detail: "no payTo to inspect", weight: 15 },
          { check: "stablecoin-funded", pass: false, detail: "no payTo to inspect", weight: 15 },
        ]),
    qualityEvidence(opts.name ?? opts.endpoint, opts.description ?? ""),
  ]);

  const evidence = [...probe.filter((e) => e.weight > 0), ...onchain, ...quality];
  const max = evidence.reduce((s, e) => s + e.weight, 0);
  const got = evidence.reduce((s, e) => s + (e.pass ? e.weight : 0), 0);
  const score = Math.round((got / max) * 100);

  const card: ScoreCard = {
    target: opts.endpoint,
    score,
    grade: grade(score),
    evidence,
    issuedAt: new Date().toISOString(),
    issuer: issuer.address,
  };
  card.signature = await issuer.signMessage({
    message: JSON.stringify({
      target: card.target,
      score: card.score,
      grade: card.grade,
      issuedAt: card.issuedAt,
      issuer: card.issuer,
    }),
  });
  return card;
}
