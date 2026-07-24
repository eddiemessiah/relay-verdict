# Progress — Relay + Verdict
*Updated July 24, 2026 · stream July 27 · submission Aug 3, 09:00 GMT*

## What is built (all verified working)

**The rail (Relay).** An A2A x402 settlement layer + service directory on
Celo. Agents discover metered services, get a 402 challenge, sign an EIP-3009
transfer with their own key, and the Celo facilitator settles USDC/USDT
onchain. SSE event stream + stats feed the live dashboard. Free mode
exercises the identical code path without funds.

**The judge (Verdict).** A reputation oracle that scores agent services with
evidence: live x402 probe (well-formed 402, latency), onchain footprint via
Celo RPC (activity, stablecoin funding), LLM-assisted quality review. Cards
are EIP-191-signed and sold per query ($0.005) through Relay.

**The ERC-8004 bridge (the Aigora integration).** Verdict reads the Identity
Registry (`0x8004A169…a432`) on Celo mainnet — verified against real
registered agents — and publishes scores to the Reputation Registry
(`0x8004BAa1…9b63`) via `giveFeedback(tag1: "verdict")`, with the ERC-8021
attribution tag on every transaction. Registry sweeps score *any* registered
agent; entries without probeable endpoints get registration-hygiene scores
(our sweep of real mainnet agents found localhost URLs, placeholder repos,
unreachable metadata — exactly the trust gap Verdict closes).

**The marketplace + arena (the product).** Three surfaces at one URL:
- `/` landing — the pitch, animated agent orbit, the five-beat settlement story
- `/marketplace` — listings with Verdict trust badges + **bring-your-agent
  admission**: any builder submits an x402 endpoint, Verdict probes it live,
  D-or-better gets listed (verified end-to-end in the browser: B·85 admission)
- `/arena` — mission control: live settlement ticker, counters, latest
  verdict seal, Celoscan links

**The swarm.** Autonomous agent fleet that continuously buys real micro-work
across the directory — every hop one x402 settlement.

## Why it matters to the Celo ecosystem

1. **It makes "Celo is where agents transact" literal.** x402 + EIP-3009 +
   CIP-64 + ERC-8004 already exist on Celo; Relay composes them into a loop
   where agent work and onchain settlement are the same event.
2. **It supplies the trust layer the agent economy is missing.** 1,000+
   agents sit in Celo's ERC-8004 registry, but reputation entries are sparse
   and registrations are often broken. Verdict turns the registry from a
   phone book into a credit bureau — evidence-first, onchain, queryable by
   Aigora bidders, Askbots users, and any marketplace.
3. **It's compounding infra, not a demo.** Every new listed agent makes the
   directory more valuable; every Verdict score makes ERC-8004 reputation
   denser; every settlement is attributed onchain. Other hackathon teams are
   our first users, not our competitors.
4. **It sidesteps the MiniPay EIP-712 blocker** (agents sign server-side), so
   the agent side of Celo's economy doesn't need to wait for a wallet fix.

## Aigora + Askbots strategy (Tracks 3 & 4)

**Aigora** ranks bidding agents by ERC-8004 reputation. Verdict *writes* that
reputation — evidence-backed, hash-committed, tagged. Our Track 4 feedback is
not a doc of opinions; it's a working reputation supplier plus field data
from sweeping their registry (broken registrations quantified, feedback-tag
conventions proposed: `verdict`/grade, uptime, reachable). Deliverable:
`docs/AIGORA_FEEDBACK.md` + onchain `giveFeedback` transactions Aigora can
render today.

**Askbots** rates agents. Verdict is an Askbots-native reviewer: it registers
as an agent, publishes evidence-first reviews (probe transcript + onchain
checks + signed card), and earns per review — the AnyPayReviewer pattern,
but with every claim verifiable onchain. Deliverable: Verdict listed on
Askbots + recurring automated review runs during the final week.

## Adoption plan — how people start using it

The wedge is **other builders in this hackathon** (they all need trust +
revenue):
1. **"List your agent, get scored, start earning" campaign** in the hackathon
   Telegram — the marketplace admission flow takes one form submit; the
   scorecard is shareable proof their agent actually works.
2. **Livestream on CeloDevs (July 27)** — the arena as spectacle: swarm
   settling onchain live, a community agent admitted on air, a registry sweep
   published to ERC-8004 on camera.
3. **Registry sweeps as content** — weekly "State of the Agent Registry"
   scorecards (top agents, broken registrations) posted to X; every mention
   is an Aigora/8004scan/Askbots citation.
4. **SDK path** — `@relay/agent-kit` + `celo-pay` are importable as-is; a
   builder adds one route + one env var to become a paid x402 service.

## Next steps (owner)
- [ ] **USER:** provide the Claude Design zip → skin all three pages
- [ ] **USER:** register via Celo Builders skill (repo:
      github.com/eddiemessiah/relay-verdict) → attribution tag
- [ ] **USER:** fund treasury + verdict/agent keys (USDT/USDC, see WIN_PLAN)
- [ ] Deploy dashboard (Vercel) + Relay (persistent host)
- [ ] Flip LIVE: first tagged settlements + first onchain giveFeedback
- [ ] Register Relay + Verdict on Aigora (ERC-8004) + Askbots
- [ ] AIGORA_FEEDBACK.md; submission tweet; demo rehearsal
