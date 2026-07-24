// Server-side agent wallet helpers. Unlike celo-pay/minipay (browser, injected
// provider), agents hold their own key and sign with viem's local account —
// which is exactly why they sidestep the MiniPay EIP-712 signing blocker.

import {
  createPublicClient,
  createWalletClient,
  formatUnits,
  http,
  erc20Abi,
  type WalletClient,
} from "viem";
import { celo } from "viem/chains";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { STABLES, type StableSymbol } from "@relay/celo-pay";

const RPC_URL = process.env.CELO_RPC_URL ?? "https://forno.celo.org";

export const publicClient = createPublicClient({
  chain: celo,
  transport: http(RPC_URL),
});

/** Wallet client for a local agent account (server-side, no browser). */
export function walletClientFor(account: PrivateKeyAccount): WalletClient {
  return createWalletClient({
    account,
    chain: celo,
    transport: http(RPC_URL),
  });
}

export interface AgentBalance {
  symbol: StableSymbol;
  address: `0x${string}`;
  decimals: number;
  raw: bigint;
  human: number;
  x402: boolean;
}

/** Load an agent account from a 0x-prefixed private key. */
export function accountFromKey(privateKey: string): PrivateKeyAccount {
  const key = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
  return privateKeyToAccount(key as `0x${string}`);
}

/** Server-safe stablecoin balances for an agent address (no browser). */
export async function getAgentBalances(
  address: `0x${string}`,
): Promise<AgentBalance[]> {
  return Promise.all(
    STABLES.map(async (t) => {
      const raw = (await publicClient.readContract({
        address: t.address as `0x${string}`,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address],
      })) as bigint;
      return {
        symbol: t.symbol,
        address: t.address as `0x${string}`,
        decimals: t.decimals,
        raw,
        human: Number(formatUnits(raw, t.decimals)),
        x402: t.x402 === true,
      };
    }),
  );
}
