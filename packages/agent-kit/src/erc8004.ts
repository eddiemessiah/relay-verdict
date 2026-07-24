// ERC-8004 (Trustless Agents) on Celo mainnet — identity + reputation.
//
// This is the bridge between Verdict and the wider agent economy:
//  - Aigora's task marketplace ranks bidding agents by ERC-8004 reputation.
//  - Verdict publishes its evidence-backed scores here via giveFeedback(),
//    so every scorecard becomes shared onchain infrastructure (and a tagged
//    Celo transaction).
//  - The Identity Registry is Verdict's crawl surface: tokenURI() →
//    registration JSON → service endpoints → probe → score → feedback.

import {
  encodeFunctionData,
  keccak256,
  toHex,
  type Hex,
} from "viem";
import type { PrivateKeyAccount } from "viem/accounts";
import { withAttribution } from "@relay/celo-pay";
import { publicClient, walletClientFor } from "./wallet";

export const IDENTITY_REGISTRY =
  "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as const;
export const REPUTATION_REGISTRY =
  "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63" as const;

export const identityAbi = [
  {
    type: "function",
    name: "register",
    stateMutability: "nonpayable",
    inputs: [{ name: "agentURI", type: "string" }],
    outputs: [{ name: "agentId", type: "uint256" }],
  },
  {
    type: "function",
    name: "tokenURI",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

export const reputationAbi = [
  {
    type: "function",
    name: "giveFeedback",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "value", type: "int128" },
      { name: "valueDecimals", type: "uint8" },
      { name: "tag1", type: "string" },
      { name: "tag2", type: "string" },
      { name: "endpoint", type: "string" },
      { name: "feedbackURI", type: "string" },
      { name: "feedbackHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getSummary",
    stateMutability: "view",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "clientAddresses", type: "address[]" },
      { name: "tag1", type: "string" },
      { name: "tag2", type: "string" },
    ],
    outputs: [
      { name: "count", type: "uint64" },
      { name: "summaryValue", type: "int128" },
      { name: "summaryValueDecimals", type: "uint8" },
    ],
  },
] as const;

/** Registration JSON an ERC-8004 agent points its tokenURI at. */
export interface AgentRegistration {
  type: "Agent";
  name: string;
  description: string;
  image?: string;
  endpoints: Array<
    | { type: "a2a" | "mcp" | "http"; url: string }
    | { type: "wallet"; address: `0x${string}`; chainId: number }
  >;
  supportedTrust?: string[];
}

/** Register an agent identity onchain. Returns the tx hash (agentId lands in the Transfer event). */
export async function registerAgent(
  account: PrivateKeyAccount,
  agentURI: string,
): Promise<Hex> {
  const wallet = walletClientFor(account);
  const data = withAttribution(
    encodeFunctionData({
      abi: identityAbi,
      functionName: "register",
      args: [agentURI],
    }),
  );
  const hash = await wallet.sendTransaction({
    account,
    to: IDENTITY_REGISTRY,
    data,
    chain: wallet.chain,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

/** Read an agent's registration file via its tokenURI (http(s), ipfs via gateway, or data: URI). */
export async function fetchRegistration(
  agentId: bigint,
): Promise<{ uri: string; registration: AgentRegistration | null }> {
  let uri: string;
  try {
    uri = (await publicClient.readContract({
      address: IDENTITY_REGISTRY,
      abi: identityAbi,
      functionName: "tokenURI",
      args: [agentId],
    })) as string;
  } catch {
    return { uri: "", registration: null }; // unregistered / burned id
  }

  let url = uri;
  if (uri.startsWith("ipfs://")) {
    url = `https://ipfs.io/ipfs/${uri.slice("ipfs://".length)}`;
  }
  try {
    if (uri.startsWith("data:")) {
      // e.g. data:application/json;enc=gzip;level=6;base64,H4sIA…
      const [meta, b64 = ""] = uri.split(",");
      let buf = Buffer.from(b64, "base64");
      if (/enc=gzip/.test(meta)) {
        const { gunzipSync } = await import("node:zlib");
        buf = gunzipSync(buf);
      }
      return { uri, registration: JSON.parse(buf.toString("utf8")) };
    }
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { uri, registration: null };
    const text = await res.text();
    return { uri, registration: JSON.parse(text) as AgentRegistration };
  } catch {
    return { uri, registration: null };
  }
}

/**
 * Publish a Verdict scorecard to the ERC-8004 Reputation Registry.
 * tag1 "verdict" groups our feedback; tag2 carries the letter grade. The
 * feedbackHash commits to the full signed scorecard JSON so anyone can verify
 * the evidence behind the number. Carries the ERC-8021 attribution suffix.
 */
export async function publishScoreOnchain(
  account: PrivateKeyAccount,
  opts: {
    agentId: bigint;
    score: number; // 0-100
    grade: string;
    endpoint: string;
    feedbackURI: string; // where the full scorecard JSON lives
    scorecardJson: string; // full card — hashed onchain
  },
): Promise<Hex> {
  const wallet = walletClientFor(account);
  const data = withAttribution(
    encodeFunctionData({
      abi: reputationAbi,
      functionName: "giveFeedback",
      args: [
        opts.agentId,
        BigInt(Math.round(opts.score)),
        0,
        "verdict",
        opts.grade,
        opts.endpoint,
        opts.feedbackURI,
        keccak256(toHex(opts.scorecardJson)),
      ],
    }),
  );
  const hash = await wallet.sendTransaction({
    account,
    to: REPUTATION_REGISTRY,
    data,
    chain: wallet.chain,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

/** Aggregate Verdict-tagged reputation for an agent (what Aigora bidders see). */
export async function readVerdictSummary(agentId: bigint) {
  const [count, value, decimals] = (await publicClient.readContract({
    address: REPUTATION_REGISTRY,
    abi: reputationAbi,
    functionName: "getSummary",
    args: [agentId, [], "verdict", ""],
  })) as [bigint, bigint, number];
  return { count, value, decimals };
}
