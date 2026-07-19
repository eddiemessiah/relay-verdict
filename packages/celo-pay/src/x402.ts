// x402 on Celo — minimal, self-contained implementation of the "exact" scheme
// against the Celo facilitator (https://x402.celo.org, x402-rs).
//
// Flow: client hits a gated endpoint → 402 + payment requirements → client
// signs an EIP-3009 transferWithAuthorization (typed data — gasless, works in
// MiniPay) → retries with X-PAYMENT header → server verifies + settles via the
// facilitator → 200. Settlement txs are submitted BY the facilitator to the
// registered payTo wallet, which is how Track 2 counts them.

import { parseUnits, type Hex } from "viem";
import { FACILITATOR_URL, X402_NETWORK, STABLES } from "./stables";

export const X402_VERSION = 1;

export interface PaymentRequirements {
  scheme: "exact";
  network: string;
  maxAmountRequired: string; // atomic units
  resource: string;
  description: string;
  mimeType: string;
  payTo: `0x${string}`;
  maxTimeoutSeconds: number;
  asset: `0x${string}`;
  extra: { name: string; version: string };
}

export interface PaymentPayload {
  x402Version: number;
  scheme: "exact";
  network: string;
  payload: {
    signature: Hex;
    authorization: {
      from: `0x${string}`;
      to: `0x${string}`;
      value: string;
      validAfter: string;
      validBefore: string;
      nonce: Hex;
    };
  };
}

const x402Stables = STABLES.filter((s) => s.x402);

/**
 * Payment requirements for a USD price (e.g. "0.013" ≈ ₦20). One entry per
 * EIP-3009-capable stablecoin so the payer's preferred token can settle.
 */
export function buildRequirements(opts: {
  priceUsd: string;
  payTo: `0x${string}`;
  resource: string;
  description: string;
}): PaymentRequirements[] {
  return x402Stables.map((t) => ({
    scheme: "exact",
    network: X402_NETWORK,
    maxAmountRequired: parseUnits(opts.priceUsd, t.decimals).toString(),
    resource: opts.resource,
    description: opts.description,
    mimeType: "application/json",
    payTo: opts.payTo,
    maxTimeoutSeconds: 300,
    asset: t.address as `0x${string}`,
    extra: t.eip712,
  }));
}

export function paymentRequiredBody(accepts: PaymentRequirements[]) {
  return {
    x402Version: X402_VERSION,
    error: "X-PAYMENT header is required",
    accepts,
  };
}

// ---------------------------------------------------------------------------
// Server side: verify + settle through the facilitator
// ---------------------------------------------------------------------------

export interface SettleResult {
  ok: boolean;
  payer?: `0x${string}`;
  transaction?: Hex;
  error?: string;
}

async function facilitator(path: string, body: unknown): Promise<any> {
  const res = await fetch(`${FACILITATOR_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`facilitator ${path} → ${res.status}`);
  return res.json();
}

export function decodePaymentHeader(header: string): PaymentPayload {
  return JSON.parse(Buffer.from(header, "base64").toString("utf8"));
}

/**
 * Verify then settle an X-PAYMENT header against the matching requirements
 * entry. Call from the gated route; on ok, serve the paid content and attach
 * `X-PAYMENT-RESPONSE` so clients get their receipt.
 */
export async function verifyAndSettle(
  paymentHeader: string,
  accepts: PaymentRequirements[],
): Promise<SettleResult> {
  let payload: PaymentPayload;
  try {
    payload = decodePaymentHeader(paymentHeader);
  } catch {
    return { ok: false, error: "malformed X-PAYMENT header" };
  }

  // The exact-scheme payload doesn't name the asset it was signed for (the
  // asset is the EIP-712 verifyingContract). Candidates whose atomic amount
  // matches the signed value are tried in order; the wrong asset fails
  // signature verification, the right one validates.
  const candidates = accepts.filter(
    (r) => r.maxAmountRequired === payload.payload.authorization.value,
  );
  if (candidates.length === 0) {
    return { ok: false, error: "signed amount does not match price" };
  }

  let lastReason = "invalid payment";
  for (const requirements of candidates) {
    const body = {
      x402Version: X402_VERSION,
      paymentPayload: payload,
      paymentRequirements: requirements,
    };
    const verify = await facilitator("/verify", body);
    if (!verify.isValid) {
      lastReason = verify.invalidReason ?? lastReason;
      continue;
    }
    const settle = await facilitator("/settle", body);
    if (!settle.success) {
      return { ok: false, error: settle.errorReason ?? "settlement failed" };
    }
    return { ok: true, payer: settle.payer, transaction: settle.transaction };
  }
  return { ok: false, error: lastReason };
}

export function settlementResponseHeader(r: SettleResult): string {
  return Buffer.from(
    JSON.stringify({
      success: r.ok,
      transaction: r.transaction,
      network: X402_NETWORK,
      payer: r.payer,
    }),
  ).toString("base64");
}
