// Agent side of x402 — the net-new piece. Same EIP-3009 "exact" flow as
// celo-pay/x402-client, but signed by a local private-key account instead of a
// browser wallet. This is what lets an autonomous agent pay another agent's
// gated endpoint with zero human interaction (Track 2 volume engine).

import { toHex, type Hex } from "viem";
import { celo } from "viem/chains";
import type { PrivateKeyAccount } from "viem/accounts";
import {
  STABLES,
  X402_VERSION,
  type PaymentRequirements,
  type PaymentPayload,
} from "@relay/celo-pay";
import { getAgentBalances } from "./wallet";

const EIP3009_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

export type AgentPayResult =
  | { status: "success"; response: Response; txHash?: string; symbol: string }
  | { status: "free"; response: Response }
  | { status: "low_balance" }
  | { status: "error"; message: string };

/**
 * Fetch a paid endpoint as an agent. On 402, pay with the account's preferred
 * EIP-3009 stablecoin (highest funded balance) and retry once. Settlement is
 * submitted by the facilitator to the resource's payTo — that on-chain tx is
 * what the Track 2 leaderboard counts.
 */
export async function fetchWithAgent(
  input: string,
  account: PrivateKeyAccount,
  init?: RequestInit,
): Promise<AgentPayResult> {
  try {
    const first = await fetch(input, init);
    if (first.status !== 402) return { status: "free", response: first };

    const { accepts } = (await first.json()) as {
      accepts: PaymentRequirements[];
    };

    const freeMode = process.env.FREE_MODE === "1";
    let req: PaymentRequirements;
    let symbol: string;

    if (freeMode) {
      // Local demo: exercise 402 → sign → retry without holding funds; the
      // Relay server skips settlement, so any key and any accepted token works.
      req = accepts[0];
      symbol =
        STABLES.find((t) => t.address.toLowerCase() === req.asset.toLowerCase())
          ?.symbol ?? "?";
    } else {
      const balances = await getAgentBalances(account.address);
      const options = accepts
        .map((r) => {
          const token = STABLES.find(
            (t) => t.address.toLowerCase() === r.asset.toLowerCase(),
          );
          const bal = balances.find((b) => b.symbol === token?.symbol);
          return token && bal ? { req: r, token, bal } : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .filter((x) => x.bal.raw >= BigInt(x.req.maxAmountRequired))
        .sort((a, b) => b.bal.human - a.bal.human);
      if (options.length === 0) return { status: "low_balance" };
      req = options[0].req;
      symbol = options[0].token.symbol;
    }

    const now = Math.floor(Date.now() / 1000);
    const nonce = toHex(crypto.getRandomValues(new Uint8Array(32)));
    const value = BigInt(req.maxAmountRequired);
    const validBefore = BigInt(now + req.maxTimeoutSeconds);

    const signature = await account.signTypedData({
      domain: {
        name: req.extra.name,
        version: req.extra.version,
        chainId: celo.id,
        verifyingContract: req.asset,
      },
      types: EIP3009_TYPES,
      primaryType: "TransferWithAuthorization",
      message: {
        from: account.address,
        to: req.payTo,
        value,
        validAfter: 0n,
        validBefore,
        nonce: nonce as Hex,
      },
    });

    const payload: PaymentPayload = {
      x402Version: X402_VERSION,
      scheme: "exact",
      network: req.network,
      payload: {
        signature,
        authorization: {
          from: account.address,
          to: req.payTo,
          value: value.toString(),
          validAfter: "0",
          validBefore: validBefore.toString(),
          nonce: nonce as Hex,
        },
      },
    };

    const paid = await fetch(input, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        "X-PAYMENT": Buffer.from(JSON.stringify(payload)).toString("base64"),
      },
    });

    if (!paid.ok && paid.status === 402) {
      const err = await paid.json().catch(() => null);
      return { status: "error", message: err?.error ?? "payment rejected" };
    }

    let txHash: string | undefined;
    const receipt = paid.headers.get("X-PAYMENT-RESPONSE");
    if (receipt) {
      try {
        txHash = JSON.parse(
          Buffer.from(receipt, "base64").toString("utf8"),
        ).transaction;
      } catch {
        // best-effort receipt
      }
    }
    return { status: "success", response: paid, txHash, symbol };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "agent payment failed",
    };
  }
}
