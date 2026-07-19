// Token addresses — for balances / transfers / approvals.
// feeCurrency — ONLY for the transaction feeCurrency field (CIP-64 fee
// abstraction). USDC/USDT require adapter contracts; passing the token
// address there makes the transaction fail.
export const STABLES = [
  {
    symbol: "USDm",
    address: "0x765DE816845861e75A25fCA122bb6898B8B1282a",
    decimals: 18,
    feeCurrency: "0x765DE816845861e75A25fCA122bb6898B8B1282a",
    // Mento StableTokenV2 is EIP-2612-only (no EIP-3009), so the x402
    // facilitator cannot settle it. Direct MiniPay payments only.
    x402: false,
  },
  {
    symbol: "USDC",
    address: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
    decimals: 6,
    feeCurrency: "0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B",
    x402: true,
    eip712: { name: "USDC", version: "2" },
  },
  {
    symbol: "USDT",
    address: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
    decimals: 6,
    feeCurrency: "0x0e2a3e05bc9a16f5292a6170456a710cb89c6f72",
    x402: true,
    eip712: { name: "Tether USD", version: "1" },
  },
] as const;

export type StableSymbol = (typeof STABLES)[number]["symbol"];

export const CELO_CHAIN_ID = 42220;
export const X402_NETWORK = "eip155:42220";
export const FACILITATOR_URL = "https://x402.celo.org";

export const ADD_CASH_LINK =
  "https://link.minipay.xyz/add_cash?tokens=USDm,USDC,USDT";

export const RECEIPT_LINK = (tx: string) =>
  `https://link.minipay.xyz/receipt?tx=${tx}&celebrate`;
