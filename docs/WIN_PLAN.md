# Win Plan — final week (Jul 24 → Aug 3)

## Where we can rank, honestly

| Track | Our angle | Confidence |
|---|---|---|
| **2 · Most x402** | Swarm + marketplace = continuous settled x402 calls, 24/7 once live. Every call real work. | **Primary target** |
| **3 · Askbots ($500)** | Verdict = evidence-first reviewer agent, automated daily runs, onchain-verifiable reviews. | Strong |
| **4 · Aigora ($500)** | Working ERC-8004 reputation supplier + registry field data — feedback as running code. | Strong |
| **1 · Most Revenue** | Tagged volume from swarm + community listings counts, but we're outgunned by consumer apps. | Opportunistic |

## The one thing that gates everything: GO LIVE EARLY
Leaderboards count **tagged onchain transactions**. Every day not live is
volume lost. Target: **live by July 25**, two full days before the stream.

### Funding plan (USER) — do this right after registration
Fund **after** the attribution tag is set, so no untagged tx leak:
1. **Treasury / payTo** (receives x402 settlements): just needs to exist —
   `PAYTO_ADDRESS` env. No funding required to receive.
2. **Verdict key** (`VERDICT_KEY`): needs **CELO gas** (~0.5 CELO) for
   `giveFeedback` writes, plus ~$2 USDT for buying probe calls.
3. **Swarm agent keys** (2–3, `AGENT_KEYS`): **$5–10 USDT/USDC each.** At
   $0.001–0.005/call, $20 total ≈ 4,000–20,000 settled calls — more than
   enough for the leaderboard; the constraint is call cadence, not budget.
Keep amounts small; top up only if the leaderboard race demands it.

## Day-by-day
- **Jul 24 (today):** design skin lands → apply; Vercel + Relay host deploys;
  user registers → tag set.
- **Jul 25:** GO LIVE. First tagged settlements on Celoscan. Verdict + Relay
  registered on Aigora (ERC-8004 identity) and Askbots. Start 24/7 swarm at
  a sustainable cadence (e.g. 1 call/min ≈ $1.5–7/day).
- **Jul 26:** First onchain registry sweep published (`PUBLISH=1`). Post
  "State of the Agent Registry" thread. Telegram campaign: "list your agent,
  get scored." Rehearse stream run-of-show.
- **Jul 27: LIVESTREAM.** Arc: arena live → community agent admitted on air →
  swarm cadence bump → registry sweep publishes giveFeedback on camera →
  open Celoscan + 8004scan as proof. CTA: marketplace URL.
- **Jul 28–31:** Ride the post-stream attention: admit community agents,
  daily Askbots reviews, keep swarm running, AIGORA_FEEDBACK.md finalized.
- **Aug 1–2:** Submission package: description, demo video, X post
  (@CeloDevs @Celo + ERC-8004 registry link), payTo wallet in submission
  (Track 2 requirement). Buffer day.
- **Aug 3, before 09:00 GMT:** Submit via Celo Builders skill.

## Judge-proofing (sybil screen)
Judges manually screen for wash traffic. Our defenses, stated in the
submission: every payment buys real computed output; Verdict scores are
falsifiable evidence anyone can re-run; swarm agents are few, named, and
publicly listed; community listings are third-party builders. We sell
*utility volume*, not raw count.

## Stream run-of-show (10 min)
1. (1 min) The pitch: machines run this economy, Celo settles it.
2. (2 min) Arena live — swarm settling, ticker + Celoscan link on screen.
3. (2 min) Bring-your-agent: admit a community agent on air, Verdict evidence
   on screen.
4. (2 min) Registry sweep: score real ERC-8004 agents, publish giveFeedback
   onchain, show it on 8004scan.
5. (2 min) The stack story: x402 · EIP-3009 · ERC-8004 · ERC-8021 · CIP-64.
6. (1 min) CTA: marketplace URL + "your agent could be earning by tonight."
