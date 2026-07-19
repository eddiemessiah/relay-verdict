"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  parseUnits,
} from "viem";
import { celo } from "viem/chains";
import {
  STABLES,
  type StableSymbol,
  ADD_CASH_LINK,
  RECEIPT_LINK,
} from "./stables";
import { withAttribution } from "./attribution";

export { STABLES, ADD_CASH_LINK, RECEIPT_LINK };
export type { StableSymbol };

declare global {
  interface Window {
    // MiniPay injects an EIP-1193 provider with an `isMiniPay` flag.
    ethereum?: {
      isMiniPay?: boolean;
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    };
  }
}

// Where direct in-app purchases land. When unset we run in demo mode and
// route the payment back to the payer's own wallet so the flow stays testable.
const TREASURY = process.env.NEXT_PUBLIC_TREASURY_ADDRESS as
  | `0x${string}`
  | undefined;

const publicClient = createPublicClient({ chain: celo, transport: http() });

export interface TokenBalance {
  symbol: StableSymbol;
  address: `0x${string}`;
  decimals: number;
  feeCurrency: `0x${string}`;
  raw: bigint;
  human: number;
}

export async function getBalances(
  user: `0x${string}`,
): Promise<TokenBalance[]> {
  return Promise.all(
    STABLES.map(async (t) => {
      const raw = (await publicClient.readContract({
        address: t.address as `0x${string}`,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [user],
      })) as bigint;
      return {
        symbol: t.symbol,
        address: t.address as `0x${string}`,
        decimals: t.decimals,
        feeCurrency: t.feeCurrency as `0x${string}`,
        raw,
        human: Number(formatUnits(raw, t.decimals)),
      };
    }),
  );
}

export type PayResult =
  | { status: "success"; txHash: string; symbol: StableSymbol }
  | { status: "low_balance" }
  | { status: "error"; message: string };

/**
 * Charge the user in their preferred stablecoin (the one they hold the most
 * of), paying the network fee in that same stablecoin via CIP-64 fee
 * abstraction. Every transfer carries the ERC-8021 attribution suffix.
 */
export async function payWithPreferred(amountUsd: string): Promise<PayResult> {
  try {
    if (typeof window === "undefined" || !window.ethereum) {
      return { status: "error", message: "No wallet found" };
    }
    const walletClient = createWalletClient({
      chain: celo,
      transport: custom(window.ethereum),
    });
    const [sender] = await walletClient.getAddresses();
    const balances = await getBalances(sender);
    const need = Number(amountUsd);
    const funded = balances
      .filter((b) => b.human >= need)
      .sort((a, b) => b.human - a.human);
    if (funded.length === 0) return { status: "low_balance" };

    const token = funded[0];
    const to = TREASURY ?? sender; // demo mode: pay yourself
    const data = withAttribution(
      encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [to, parseUnits(amountUsd, token.decimals)],
      }),
    );

    const txHash = await walletClient.sendTransaction({
      account: sender,
      to: token.address,
      data,
      feeCurrency: token.feeCurrency,
    } as never);

    await publicClient.waitForTransactionReceipt({ hash: txHash });
    return { status: "success", txHash, symbol: token.symbol };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Payment failed",
    };
  }
}

export interface MiniPayState {
  address: `0x${string}` | null;
  isMiniPay: boolean;
  hasWallet: boolean;
  balances: TokenBalance[];
  totalUsd: number;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

export function useMiniPay(): MiniPayState {
  const [address, setAddress] = useState<`0x${string}` | null>(null);
  const [isMiniPay, setIsMiniPay] = useState(false);
  const [hasWallet, setHasWallet] = useState(false);
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!address) return;
    try {
      setBalances(await getBalances(address));
    } catch {
      // RPC hiccup — keep last-known balances, common on 2G/3G.
    }
  }, [address]);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      if (typeof window === "undefined" || !window.ethereum) {
        setIsLoading(false);
        return;
      }
      setHasWallet(true);
      setIsMiniPay(window.ethereum.isMiniPay === true);
      try {
        // Zero-click connect: never show a connect button inside MiniPay.
        const client = createWalletClient({
          chain: celo,
          transport: custom(window.ethereum),
        });
        const accounts = await client.requestAddresses();
        if (!cancelled && accounts[0]) setAddress(accounts[0]);
      } catch {
        // user declined — leave address null
      }
      if (!cancelled) setIsLoading(false);
    }
    init();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const totalUsd = balances.reduce((s, b) => s + b.human, 0);
  return { address, isMiniPay, hasWallet, balances, totalUsd, isLoading, refresh };
}
