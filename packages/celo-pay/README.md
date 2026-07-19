# @hack/celo-pay

Shared payment layer for Padi & Oga. Ported from the proven minibuild MiniPay
integration, extended with x402 and ERC-8021 attribution.

| Module | Import | What it gives you |
|--------|--------|-------------------|
| `stables` | `@hack/celo-pay` | USDm/USDC/USDT addresses, CIP-64 fee adapter addresses, facilitator URL, MiniPay deeplinks |
| `attribution` | `@hack/celo-pay` | `withAttribution(data)` — appends the assigned `celo_...` ERC-8021 suffix to every tx we send |
| `x402` (server) | `@hack/celo-pay/x402` | `buildRequirements` / `verifyAndSettle` — 402 challenge + facilitator verify/settle for gated routes |
| `minipay` (client) | `@hack/celo-pay/client` | `useMiniPay()` zero-click connect, balances, `payWithPreferred()` CIP-64 direct payments |
| `x402-client` | `@hack/celo-pay/client` | `fetchWithMiniPay(url)` — 402 → EIP-3009 typed-data sign in MiniPay (gasless) → retry |

Design rules honored: no Connect button inside MiniPay, "network fee" / "Deposit"
copy, `add_cash` deeplink on low balance, receipt deeplink on success, no raw 0x
addresses shown to users, no CELO ever required.

The x402 protocol layer is implemented directly against the Celo facilitator
(`/verify`, `/settle`) rather than through `x402-next`/`x402-fetch`, so we are
not hostage to any package's network allowlist, and the client side works with
MiniPay's injected provider out of the box.
