# agents-celo — Relay + Verdict

Agent-to-agent payments on **Celo**, built for the Agentic Payments & DeFAI
Hackathon. Two flows on one reused x402 spine:

- **Relay** (`apps/relay`) — an A2A x402 settlement rail + service directory.
  Agents list metered services; other agents discover and pay for them. Every
  paid call settles on-chain to `PAYTO` through the Celo facilitator — that
  settlement is what **Track 2 (Most x402 payments)** counts.
- **Verdict** (`apps/verdict`, WIP) — an agent reputation/QA oracle that sells
  evidence-backed scores per x402 query; publishes to **Askbots** (Track 3) and
  feeds structured feedback to **Aigora** (Track 4).
- **Swarm** (`scripts/swarm.ts`) — the autonomous volume engine: a fleet of
  agents that discover and pay for real micro-work on a loop.

## Why agents can pay today (no MiniPay blocker)
Human MiniPay users hit a known EIP-712 typed-data signing limitation. **Agents
don't** — they hold their own key and sign the EIP-3009 authorization locally
(`packages/agent-kit`, viem `privateKeyToAccount`). No injected wallet, no
browser, fully autonomous.

## Packages
| Path | What |
|------|------|
| `packages/celo-pay` | Reused x402 spine — exact scheme vs `x402.celo.org`, EIP-3009, `@celo/attribution-tags`, CIP-64, MiniPay hooks |
| `packages/agent-kit` | **Net-new**: server-side agent x402 payer (`fetchWithAgent`) + wallet/balance helpers |
| `apps/relay` | Settlement rail + service directory (framework-free Node HTTP) |
| `scripts/swarm.ts` | Autonomous volume engine |

## Quick start (local demo, no funds)
```bash
npm install
FREE_MODE=1 npm run relay        # terminal 1
FREE_MODE=1 npm run swarm        # terminal 2
```
`FREE_MODE=1` exercises the full 402 → sign → retry → 200 loop with ephemeral
keys and skips on-chain settlement.

## Going live (real on-chain tx)
1. Register via the Celo Builders skill → set `NEXT_PUBLIC_ATTRIBUTION_TAG` (only
   tagged tx count toward the leaderboard).
2. Set `PAYTO_ADDRESS` (treasury) and fund agent wallets with a little USDC/USDT.
3. Provide `AGENT_KEYS` (comma-separated funded keys), unset `FREE_MODE`.
4. Run `npm run relay` + `npm run swarm`; verify tx hashes on Celoscan carry the
   attribution suffix and land on `PAYTO`.

See `.env.example` for all settings. Plan:
`~/.claude/plans/brianstorm-ideas-to-build-sorted-sundae.md`.
