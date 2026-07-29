# Relay + Verdict — Complete Project Handoff

*Written July 24, 2026, for external reviewers. Everything below is implemented
and verified unless explicitly marked PENDING. Repo:
https://github.com/eddiemessiah/relay-verdict · Live: https://relay-verdict.vercel.app*

---

## 1. What this is

**Relay** is an agent-to-agent (A2A) marketplace and settlement rail on **Celo
mainnet**. AI agents discover metered services in a directory, call them over
plain HTTP, and pay per call in stablecoins (USDC/USDT) using the **x402
protocol** (HTTP 402 payment challenges + EIP-3009 gasless transfers). No
accounts, no API keys, no humans: an agent with a funded wallet and a `curl`
can buy, sell, and earn.

**Verdict** is the resident **reputation oracle**. It scores any agent service
with real evidence (live endpoint probe, on-chain footprint, quality review),
signs the scorecard, sells it per query ($0.005 via x402), and publishes
scores to the **ERC-8004 Reputation Registry** on Celo — the same registry
that Aigora (Celo's agent task marketplace) reads when agents bid for work.

Built for the **Celo Agentic Payments & DeFAI Hackathon** (deadline Aug 3,
2026, 09:00 GMT; live demo on the CeloDevs X stream July 27). Target tracks:
Track 2 (Most x402 payments), Track 3 (Askbots), Track 4 (Aigora feedback).

**Strategic thesis:** payments leaderboards are won by autonomy × frequency.
A swarm of agents doing real micro-work mints settlements 24/7; every payment
buys actual computed output (not wash traffic). Verdict supplies the trust
layer that any A2A market needs before it can scale.

## 2. Monorepo layout

```
agents-celo/  (npm workspaces, TypeScript, Node 24, tsx runner)
├── packages/
│   ├── celo-pay/          # payment spine (framework-free TS lib)
│   │   └── src/
│   │       ├── x402.ts          # server: 402 challenge build + verify/settle vs facilitator
│   │       ├── x402-client.ts   # browser/MiniPay payer (injected wallet)
│   │       ├── minipay.ts       # MiniPay hooks: zero-click connect, balances, CIP-64 pay
│   │       ├── attribution.ts   # ERC-8021 attribution tag suffix (leaderboard credit)
│   │       └── stables.ts       # USDC/USDT/USDm addresses, fee adapters, facilitator URL
│   └── agent-kit/         # server-side agent toolkit
│       └── src/
│           ├── wallet.ts        # local-key accounts, walletClientFor, balances (viem)
│           ├── agent-x402.ts    # fetchWithAgent(): 402 -> sign EIP-3009 locally -> retry
│           └── erc8004.ts       # ERC-8004 Identity+Reputation clients (Celo mainnet)
├── apps/
│   ├── relay/server.ts    # the rail: directory + x402-gated services + SSE + discovery
│   ├── verdict/oracle.ts  # the oracle: probes, scores, signs
│   └── dashboard/         # Next.js 15 app (3 pages), deployed on Vercel
├── scripts/
│   ├── swarm.ts           # autonomous agent fleet (volume engine)
│   ├── buy-verdict.ts     # CLI: buy a scorecard via x402
│   ├── sweep-registry.ts  # Verdict sweeps real ERC-8004 agents on mainnet
│   └── register-8004.ts   # registers Relay+Verdict on the Identity Registry
└── docs/                  # IMPLEMENTATION, PROGRESS, WIN_PLAN, DESIGN_BRIEF, this file
```

## 3. The payment spine (packages/celo-pay) — battle-tested core

Implements x402's **"exact" scheme directly against the Celo facilitator**
(`https://x402.celo.org`, x402-rs) rather than via `x402-next`/`x402-fetch`,
to avoid package network-allowlists.

**Server side (`x402.ts`):**
- `buildRequirements({priceUsd, payTo, resource, description})` → one
  `PaymentRequirements` entry per EIP-3009-capable stablecoin (USDC + USDT;
  USDm/Mento is EIP-2612-only so the facilitator can't settle it).
- `verifyAndSettle(paymentHeader, accepts)` → decodes the base64 `X-PAYMENT`
  header, matches candidate requirements by signed amount (the payload doesn't
  name the asset; the wrong asset fails signature verification), then calls
  facilitator `/verify` + `/settle`. **The facilitator submits the on-chain tx
  to `payTo` — that settlement is the Track 2 leaderboard unit.** Gasless for
  the payer.

**Client side:**
- `x402-client.ts` (browser/MiniPay): picks the funded stablecoin with the
  highest balance, signs EIP-712 `TransferWithAuthorization`, retries with the
  header. NOTE: MiniPay's in-app browser cannot sign EIP-712 typed data (known
  ecosystem blocker) — human-in-MiniPay x402 is blocked upstream.
- `agent-kit/agent-x402.ts` (`fetchWithAgent`): the same flow but signing with
  a **local private key** (viem `privateKeyToAccount`) — no browser, no
  injected wallet. **This is why the agent economy is unblocked on Celo today
  even though the human MiniPay path isn't.**

**Attribution (`attribution.ts`):** `withAttribution(data)` appends the
hackathon's assigned ERC-8021 `celo_...` tag (env `NEXT_PUBLIC_ATTRIBUTION_TAG`)
as a calldata suffix on every tx we send. Only tagged txs count on the
leaderboard. ABI decoders ignore trailing bytes.

## 4. Relay — the rail (apps/relay/server.ts)

Framework-free Node HTTP server (~350 lines). In-memory state (deliberate for
the hackathon; see §10).

**Endpoints:**
| Route | What it does |
|---|---|
| `GET /services` | directory: built-in services + Verdict-admitted community listings |
| `POST /s/:id` | x402-gated service call: no `X-PAYMENT` → 402 + requirements; with header → verify/settle → run handler → 200 + `X-PAYMENT-RESPONSE` receipt (tx hash) |
| `POST /agents/register` | **bring-your-agent admission**: body `{name, endpoint, description, priceUsd}` → Verdict probes the endpoint live → score ≥ 40/100 gets listed with the scorecard as trust badge; failures get the evidence back (422) |
| `GET /events` | SSE stream (settlement / call / scorecard / service_listed events; replays last 50 on connect) — feeds the dashboard |
| `GET /stats` | counters: settlements, volumeUsd, calls, services, mode, payTo, verdictIssuer |
| `GET /skill.md` | **machine-readable how-to-participate** for any agent that finds us |
| `GET /.well-known/agent.json` | A2A-style identity manifest |

**Built-in services:** `echo` ($0.001), `wordcount` ($0.001), `verdict`
($0.005 — the real oracle, see §5).

**Modes:** `FREE_MODE=1` runs the identical code path but skips facilitator
settlement (mock receipt `0xFREE`) so the whole loop is testable with zero
funds. Live mode requires `PAYTO_ADDRESS`. Community listings are
**discovery-only**: buyers pay the lister's own endpoint directly, so lister
revenue lands in the lister's wallet (Relay is storefront, not toll booth).

## 5. Verdict — the oracle (apps/verdict/oracle.ts)

`scoreService({endpoint, name?, description?, payTo?}, issuerAccount)` returns
a `ScoreCard { target, score 0-100, grade A-F, evidence[], issuedAt, issuer,
signature }`.

**Evidence checks (weighted):**
1. **Live x402 probe** (weight 60): endpoint alive + latency (<3s) +
   well-formed 402 challenge (exact scheme, payTo/asset/amount present). Also
   extracts the declared payTo for check 2.
2. **On-chain footprint** (weight 30): via Celo RPC (forno) — payTo nonce > 0
   (active identity) and stablecoin balances (funded).
3. **Quality** (weight 10): LLM-assisted description review when
   `ANTHROPIC_API_KEY` is set (Claude Haiku, PASS/FAIL + one sentence);
   heuristic fallback otherwise.

Cards are **EIP-191 signed** by the Verdict issuer key (`VERDICT_KEY`, or an
ephemeral key per boot in free mode) so any buyer can verify who issued the
judgment.

**Verified in production-like runs:** scored Relay's own echo service B·75
(honest failures: unfunded payTo, vague description); scored a UI-submitted
community listing B·85 end-to-end through the marketplace form.

## 6. ERC-8004 integration (packages/agent-kit/src/erc8004.ts) — the Aigora bridge

Celo mainnet contracts (verified live):
- Identity Registry `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`
- Reputation Registry `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`

Implemented:
- `registerAgent(account, agentURI)` → `register(string)` mints the agent's
  ERC-721 identity; attribution-tagged.
- `fetchRegistration(agentId)` → reads `tokenURI`, parses registration JSON
  from https, ipfs (gateway), and **data: URIs including gzip-encoded ones**
  (real registrations on mainnet use `data:application/json;enc=gzip;base64,`).
- `publishScoreOnchain(account, {agentId, score, grade, endpoint, feedbackURI,
  scorecardJson})` → `giveFeedback(agentId, score, 0, "verdict", grade,
  endpoint, feedbackURI, keccak256(scorecardJson))`, attribution-tagged. The
  hash commits the full signed evidence card on-chain.
- `readVerdictSummary(agentId)` → `getSummary` filtered to tag1 "verdict".

**Why it matters:** Aigora ranks bidding agents by ERC-8004 reputation.
Verdict *writes* that reputation with evidence. We're not just giving Aigora
feedback (Track 4) — we're supplying their trust layer, plus field data from
sweeping their registry.

**Registry sweep findings (real mainnet data, `scripts/sweep-registry.ts`):**
swept agents #1-13; found registrations pointing at `localhost:3000`,
placeholder `YOUR_USER/YOUR_REPO` GitHub URLs, malformed multi-domain URLs,
unreachable metadata. Agents without probeable endpoints get a
**registration-hygiene scorecard** instead (readable URI / endpoint declared /
wallet declared / description quality). This mess is exactly the trust gap
Verdict monetizes.

## 7. The swarm (scripts/swarm.ts) — the Track 2 volume engine

Fleet of N agents (default 3, env-tunable: `SWARM_AGENTS`, `SWARM_TICKS`,
`SWARM_INTERVAL_MS`) that continuously pick random services from the directory
and buy real work through the full 402 → sign → retry → settle loop. Verified:
12/12 settled round-trips in free mode; agents autonomously bought Verdict
scores as part of their work mix. In live mode with funded keys, every hop is
an on-chain tagged settlement. At $0.001-0.005/call, $20 of USDT ≈
4,000-20,000 settlements; the constraint is cadence, not budget.

**Sybil defense stance (judges manually screen):** every payment buys real
computed output; swarm agents are few, named, publicly listed; Verdict scores
are falsifiable (anyone can re-run the probe); community listings are
third-party builders. We sell utility volume, not raw count.

## 8. Agent discoverability — how other agents find Relay

1. **`skill.md`** (served by both the Vercel site and the rail): complete
   machine-readable participation instructions — endpoints, EIP-3009 signing,
   token addresses, self-listing. The landing page hero renders a real
   terminal strip: `curl -s https://relay-verdict.vercel.app/skill.md`.
2. **`/.well-known/agent.json`**: A2A-style manifest on both hosts.
3. **ERC-8004 registration** (`scripts/register-8004.ts`): registers Relay and
   Verdict on the Identity Registry with registration JSON embedded as a
   **data: URI** (no hosting dependency — identity survives any redeploy).
   Once run with funded keys, both appear on **8004scan.io/agents** where the
   Celo agent ecosystem already browses. Dry-run verified; on-chain PENDING
   funding.
4. **Marketplace admission**: any agent can `POST /agents/register` and become
   discoverable to every buyer. Its x402 revenue goes to its own wallet.

## 9. Frontend (apps/dashboard) — Next.js 15, deployed on Vercel

Three pages, static-prerendered, ~108kB first load, zero console errors,
desktop + 375px mobile verified, `prefers-reduced-motion` collapses all
animation.

**Design system** (iterated 3×: dark mission-control → Claude Design violet/
gold → current **brutalist halftone**, driven by the owner's inspo set —
Synthesis-hackathon aesthetic): paper canvas `#F2F0E9`, black ink, orange
signal `#F4500C`, **Anton** display (stacked mega-type), Space Grotesk body,
Space Mono numbers/terminal, halftone dot textures everywhere, film-grain
overlay, sharp corners, hard offset shadows, full-bleed black bands, Nigerian
Pidgin copy voice ("The agents dey work. You dey chill.").

- **`/` landing:** stacked hero + real curl terminal strip + halftone eye
  asset; live settlement ticker (`components/LiveEconomy.tsx` — consumes the
  rail's SSE; when no rail is reachable it degrades to a **clearly-labeled
  simulated feed**); swarm network viz with traveling payment pulses (CSS
  offset-path); Q&A editorial; four-moves ledger; rotating Verdict seal card;
  directory preview; trust marquee; black CTA band.
- **`/marketplace`:** live directory (fetches `GET /services`) + the
  bring-your-agent admission form (posts to `/agents/register`, renders the
  returned evidence checklist).
- **`/arena`:** mission control for the livestream — SSE ticker with Celoscan
  links, odometer counters from `/stats`, latest scorecard, FREE/LIVE mode
  pill, fixed chain-status strip (facilitator, payTo, verdict issuer,
  attribution state).

Config: `NEXT_PUBLIC_RELAY_URL` points the frontend at the rail (defaults to
`http://localhost:8402`).

## 10. Honest gaps & known limitations (improvement suggestions welcome here)

1. **All Relay state is in-memory** (directory, community listings, event log,
   stats). Restart = wiped. A Supabase schema exists in the owner's sibling
   project (minibuild) that could be lifted. Suggested: persistence layer +
   event log archive.
2. **Relay has no public host yet.** Vercel can't run the long-lived SSE
   process; plan is Railway/Render (owner decision pending) or a tunnel for
   the stream. Until then the prod landing ticker runs in labeled demo mode.
3. **PENDING owner actions:** hackathon registration (attribution tag), wallet
   funding, `REGISTER=1` run of register-8004, Askbots listing, Aigora
   feedback doc write-up.
4. **`feedbackURI` on `giveFeedback` is currently empty** — full scorecard
   JSON is hash-committed but not hosted. Suggested: pin cards to IPFS or
   serve `GET /cards/:hash` from Relay so third parties can fetch evidence.
5. **No rate limiting / abuse guard** on `/agents/register` (Verdict probe is
   free compute for the caller) or on SSE connections. Wide-open CORS (`*`) —
   fine for hackathon, not production.
6. **Free-mode Verdict issuer key is ephemeral** per boot (scores not
   attributable across restarts until `VERDICT_KEY` is set).
7. **The x402 candidate-matching trick** (match by amount, let signature
   verification reject wrong assets) makes an extra facilitator `/verify`
   round-trip in the worst case.
8. **Verdict evidence depth**: probe is one POST; no sustained uptime
   tracking, no historical score series, no response-content verification
   beyond the LLM description check. All obvious v2 territory.
9. **MiniPay human payments** blocked upstream by the EIP-712 limitation
   (documented; agents unaffected). TurfRun infusion (agents playing the
   owner's live MiniPay game, paying x402 entries) is designed but NOT built.
10. **No tests.** Verification has been live end-to-end runs (typecheck +
    browser + real HTTP + real mainnet reads). CI + a couple of protocol unit
    tests would be cheap wins.

## 11. How to run it

```bash
npm install
FREE_MODE=1 npx tsx apps/relay/server.ts          # rail on :8402
npm run dev --workspace=@relay/dashboard          # UI on :3402
FREE_MODE=1 npx tsx scripts/swarm.ts              # settlements flow
FREE_MODE=1 npx tsx scripts/buy-verdict.ts        # buy a scorecard
npx tsx scripts/sweep-registry.ts 1 13            # score real mainnet agents (read-only)
npx tsx scripts/register-8004.ts                  # dry-run identity registration
```

Env (`.env`): `FREE_MODE`, `RELAY_PORT`, `PAYTO_ADDRESS`, `AGENT_KEYS`
(comma-sep), `VERDICT_KEY`, `RELAY_KEY`, `RELAY_PUBLIC_URL`,
`NEXT_PUBLIC_RELAY_URL`, `NEXT_PUBLIC_ATTRIBUTION_TAG`, `ANTHROPIC_API_KEY`
(optional), `CELO_RPC_URL` (optional).

## 12. Where improvement ideas are most valuable

Ranked by leverage for the Aug 3 deadline:
1. Verdict evidence depth + hosted scorecards (feedbackURI) — sharpens Tracks 3/4
2. Persistence for listings/events — survives redeploys before the stream
3. Swarm work-mix realism (more genuinely useful micro-services to trade)
4. Relay hosting pattern for SSE at low cost
5. Security hardening (rate limits, listing spam, probe abuse)
6. Post-hackathon: take-rate model, multi-rail federation, TurfRun infusion
