# Relay + Verdict — Implementation Notes

**An agent economy that settles on Celo.** Autonomous agents discover each
other's services, pay per call in stablecoins via x402, and build on-chain
reputations — no human in the loop, every unit of work a real on-chain
settlement.

Built for the Celo **Agentic Payments & DeFAI Hackathon** (Aug 3, 2026).
Tracks: **2 (Most x402 payments)** · **3 (Askbots)** · **4 (Aigora feedback)**.

---

## 1. What is achieved so far (P1 — the spine, verified working)

| Piece | Status | Proof |
|---|---|---|
| x402 payment spine (`packages/celo-pay`) | ✅ lifted from our prior build, battle-tested | full "exact" scheme vs `https://x402.celo.org` |
| **Agent-side x402 payer** (`packages/agent-kit`) | ✅ net-new, working | 402 → EIP-3009 local sign → retry → 200 |
| Relay rail + service directory (`apps/relay`) | ✅ working | `GET /services`, x402-gated `POST /s/:id` |
| Autonomous swarm (`scripts/swarm.ts`) | ✅ working | 12/12 x402 round-trips settled in local run |
| Typecheck | ✅ clean | `npm run typecheck` |
| Verdict oracle (`apps/verdict`) | 🔨 in progress | stub service live on Relay today |
| Dashboard UI | 🔨 in progress | design system incoming |

### The verified loop (free mode, no funds needed)
```
swarm agent ──POST /s/echo──▶ Relay ──402 + PaymentRequirements──▶ agent
agent ──signs EIP-3009 TransferWithAuthorization (local key)──▶
agent ──retry with X-PAYMENT header──▶ Relay ──verify──▶ 200 + receipt
```
3 agents × 3 services × 4 ticks → **12 settled x402 calls**, zero human clicks.

---

## 2. Why this stands out

1. **It sidesteps the ecosystem's known blocker.** MiniPay's in-app browser
   can't sign EIP-712 typed data, which stalls human-facing x402 flows. Agents
   don't have that problem: `agent-kit` signs the EIP-3009 authorization with a
   local private key (`viem` `privateKeyToAccount`) — no injected wallet, no
   browser. **The agent economy is unblocked on Celo today**, and we prove it.

2. **Autonomy × frequency is the honest way to win a payments leaderboard.**
   Track 2 counts settled x402 transactions to a registered `payTo`. A human
   taps a few times a day; a swarm of agents doing real micro-work settles
   continuously. Every payment buys actual output (probe, score, computation) —
   volume from genuine utility, not wash traffic.

3. **It's infra, not just an app.** Relay is the rail + directory any Celo
   agent can list on or buy from; `agent-kit` is a drop-in payer any agent
   framework can import. Verdict adds the missing trust layer — evidence-backed
   reputation, which every A2A marketplace needs before it can scale.

4. **It's honest about verification.** Free mode exercises the entire protocol
   flow with mock settlement so the loop is testable without funds; flipping to
   live changes only *who signs and whether the facilitator settles* — not the
   code path.

---

## 3. How it integrates the Celo stack

| Celo tech | Where | How |
|---|---|---|
| **x402 facilitator** (`x402.celo.org`) | `celo-pay/src/x402.ts` | Direct `/verify` + `/settle` integration ("exact" scheme, x402-rs). The facilitator submits the settlement tx — gasless for the payer. |
| **EIP-3009 stablecoins** (USDC, USDT) | `celo-pay/src/stables.ts`, `agent-kit/src/agent-x402.ts` | `TransferWithAuthorization` typed-data signed off-chain; multi-token requirements let the payer settle in whichever stable it holds. USDm flagged non-x402 (EIP-2612 only). |
| **ERC-8021 attribution tags** | `celo-pay/src/attribution.ts` | `@celo/attribution-tags` `toDataSuffix` appends our assigned `celo_...` tag to every tx — leaderboard + Track 1 credit. |
| **CIP-64 fee abstraction** | `celo-pay/src/minipay.ts` | Direct payments pay gas in the stablecoin being sent — no CELO ever required. |
| **MiniPay** | `celo-pay/src/minipay.ts` | Zero-click connect, preferred-stablecoin balances, add-cash/receipt deeplinks — the human-facing surface for the TurfRun infusion. |
| **ERC-8004 / 8004scan** | Verdict (in progress) | Agent identity registration; Verdict reads on-chain agent history as scoring evidence. |
| **Askbots** | Verdict | Verdict publishes its evidence-backed reviews — the Track 3 surface. |
| **Aigora** | docs (planned) | Structured feedback from stress-testing x402 + ERC-8004 end-to-end. |

## 4. The agent flow

```
                    ┌────────────────────────────────┐
                    │   RELAY — rail + directory     │
                    │   GET /services (discovery)    │
                    │   POST /s/:id  (x402-gated)    │
                    └────────┬───────────▲───────────┘
                    402 + requirements   │ X-PAYMENT (EIP-3009 sig)
                             │           │
                    ┌────────▼───────────┴───────────┐
                    │   AGENT (agent-kit)            │
                    │   local key · picks funded     │
                    │   stable · signs · retries     │
                    └────────┬───────────────────────┘
                             │ settle via facilitator
                    ┌────────▼───────────────────────┐
                    │   CELO L2                      │
                    │   USDC/USDT transfer → payTo   │
                    │   + ERC-8021 attribution tag   │
                    └────────────────────────────────┘

  VERDICT (seller + buyer on Relay): probe target agent → read 8004scan
  history → score card → sold per x402 query → published to Askbots.

  SWARM: N agents on a scheduler, continuously buying real micro-work
  from the directory. Every hop = one on-chain settlement.

  TURFRUN INFUSION (demo): agents pay x402 entry to play the live MiniPay
  game — the rail powering a real consumer product.
```

## 5. Going live (what flips tonight)

1. Attribution tag from Celo Builders registration → `NEXT_PUBLIC_ATTRIBUTION_TAG`
2. Treasury → `PAYTO_ADDRESS`; agent keys funded with USDC/USDT → `AGENT_KEYS`
3. `FREE_MODE` off → the facilitator settles for real
4. Every settlement verifiable on **Celoscan** (tx to payTo, attribution suffix
   in calldata) and agent activity on **8004scan**
