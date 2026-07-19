"use client";

// Browser/MiniPay side of x402: on a 402 response, sign an EIP-3009
// transferWithAuthorization as EIP-712 typed data (no gas, no CELO — the
// facilitator submits the settlement) and retry with the X-PAYMENT header.

import {
  createWalletClient,
  custom,
  toHex,
  type Hex,
} from "viem";
import { celo } from "viem/chains";
import { STABLES } from "./stables";
import { getBalances } from "./minipay";
import {
  X402_VERSION,
  type PaymentRequirements,
  type PaymentPayload,
} from "./x402";

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

export type X402PayResult =
  | { status: "success"; response: Response; txHash?: string }
  | { status: "low_balance" }
  | { status: "free" ; response: Response }
  | { status: "error"; message: string };

/**
 * Fetch a paid endpoint. If it answers 402, pay with the user's preferred
 * EIP-3009 stablecoin (highest balance among USDC/USDT) and retry once.
 */
export async function fetchWithMiniPay(
  input: string,
  init?: RequestInit,
): Promise<X402PayResult> {
  try {
    const first = await fetch(input, init);
    if (first.status !== 402) return { status: "free", response: first };

    if (typeof window === "undefined" || !window.ethereum) {
      return { status: "error", message: "No wallet found" };
    }
    const { accepts } = (await first.json()) as {
      accepts: PaymentRequirements[];
    };

    const walletClient = createWalletClient({
      chain: celo,
      transport: custom(window.ethereum),
    });
    const [from] = await walletClient.getAddresses();

    // Preferred token = the funded x402-capable stable with highest balance.
    const balances = await getBalances(from);
    const options = accepts
      .map((req) => {
        const token = STABLES.find(
          (t) => t.address.toLowerCase() === req.asset.toLowerCase(),
        );
        const bal = balances.find((b) => b.symbol === token?.symbol);
        return token && bal ? { req, token, bal } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .filter((x) => x.bal.raw >= BigInt(x.req.maxAmountRequired))
      .sort((a, b) => b.bal.human - a.bal.human);
    if (options.length === 0) return { status: "low_balance" };

    const { req } = options[0];
    const now = Math.floor(Date.now() / 1000);
    const nonce = toHex(crypto.getRandomValues(new Uint8Array(32)));
    const authorization = {
      from,
      to: req.payTo,
      value: BigInt(req.maxAmountRequired),
      validAfter: 0n,
      validBefore: BigInt(now + req.maxTimeoutSeconds),
      nonce: nonce as Hex,
    };

    const signature = await walletClient.signTypedData({
      account: from,
      domain: {
        name: req.extra.name,
        version: req.extra.version,
        chainId: celo.id,
        verifyingContract: req.asset,
      },
      types: EIP3009_TYPES,
      primaryType: "TransferWithAuthorization",
      message: authorization,
    });

    const payload: PaymentPayload = {
      x402Version: X402_VERSION,
      scheme: "exact",
      network: req.network,
      payload: {
        signature,
        authorization: {
          from,
          to: req.payTo,
          value: authorization.value.toString(),
          validAfter: "0",
          validBefore: authorization.validBefore.toString(),
          nonce: nonce as Hex,
        },
      },
    };

    const paid = await fetch(input, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        "X-PAYMENT": btoa(JSON.stringify(payload)),
        "Access-Control-Expose-Headers": "X-PAYMENT-RESPONSE",
      },
    });

    if (!paid.ok && paid.status === 402) {
      const err = await paid.json().catch(() => null);
      return {
        status: "error",
        message: err?.error ?? "Payment was not accepted",
      };
    }

    let txHash: string | undefined;
    const receipt = paid.headers.get("X-PAYMENT-RESPONSE");
    if (receipt) {
      try {
        txHash = JSON.parse(atob(receipt)).transaction;
      } catch {
        // receipt header is best-effort
      }
    }
    return { status: "success", response: paid, txHash };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Payment failed",
    };
  }
}
