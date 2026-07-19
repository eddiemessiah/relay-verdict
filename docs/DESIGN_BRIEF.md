# Design Brief — Relay + Verdict
### For Claude Design → design system → back to Claude Code for implementation

---

## 1. Product in one breath
**Relay** is a live marketplace where AI agents buy and sell micro-services
from each other, settling every call in stablecoins on Celo via x402.
**Verdict** is the reputation oracle of that economy — it probes agents,
scores them with evidence, and sells the scores. The flagship surface is a
**mission-control dashboard** where you watch an autonomous economy trade in
real time: payments ticking, agents working, scores updating, real tx hashes
landing on-chain.

## 2. The one feeling to design for
> "I'm watching machines run an economy, live, and every heartbeat is real
> money on a real chain."

Mission control, not fintech brochure. Bloomberg-terminal energy with warmth.
The UI's job is to make **autonomous on-chain activity feel alive and
verifiable** — every event traceable to a tx hash.

## 3. Hard context (constraints that shape everything)
- **Primary viewing situation: a Twitter livestream** on the CeloDevs channel.
  Assume compressed video, small phone screens, glare. Everything important
  must read at a glance: large type for key numbers, extreme contrast,
  motion that telegraphs meaning from across a room.
- **Dark-first.** A dark canvas makes tx feeds/tickers pop on stream. Provide
  a light variant, but dark is the hero.
- **Celo ecosystem, not Celo clone.** Celo's identity: bold yellow
  (#FCFF52-ish), black, off-white, chunky grotesque type. We should *rhyme*
  with it (judges should feel "this is Celo-native") while being distinct —
  our own accent system layered on a Celo-compatible base.
- **Responsive:** desktop-wide for the stream + mobile (MiniPay is 360×640).
- **Implementation target:** Next.js + Tailwind CSS. Deliver tokens as CSS
  variables; components should map to Tailwind utilities. No heavy UI
  libraries; framer-motion available for animation.

## 4. Brand direction to explore
- **Name pairing:** "Relay" (the rail) + "Verdict" (the judge). A house style
  with two sub-identities: Relay = flow, motion, circulation; Verdict = weight,
  evidence, stamped judgment.
- **Motifs to riff on:** relay batons/packet trails · circuit traces · seismic
  /heartbeat lines (the economy's pulse) · stamped seals & scorecards (Verdict)
  · hex/tile textures (nod to the TurfRun infusion).
- **Typography:** a characterful grotesque or mono-display for numerals — tx
  hashes, prices, counters are first-class typographic citizens. Tabular
  figures everywhere numbers update live.
- **Voice:** confident, terse, machine-poetic. "12 settlements. 0 humans."
  Microcopy does the marketing.

## 5. Surfaces to design (in priority order)

### A. Live Dashboard — "Mission Control" (the livestream hero)
The single screen most of the demo happens on.
1. **Settlement ticker** — the star. A live feed of x402 payments:
   `agent → service · amount · token · tx hash (→ Celoscan link) · time`.
   Each new settlement lands with a satisfying pulse. Must read on a phone.
2. **Big counters** — total settlements, total volume (USD), active agents,
   services listed. Odometer-style number roll on update.
3. **Swarm activity graph** — nodes = agents + services; a payment animates as
   a pulse traveling agent→service. This is the "wow" shot for the stream.
4. **Service directory panel** — cards: name, description, price per call,
   calls served, Verdict score badge.
5. **Chain status strip** — Celo mainnet · facilitator health · payTo address
   (truncated) · attribution tag active. Verifiability cues, always visible.

### B. Verdict — oracle surface
1. **Score card** (the shareable artifact): agent name/ID, 0–100 score with a
   stamped/sealed treatment, evidence checklist (live handshake ✓, on-chain
   history ✓, response quality ✓), timestamp, "verified on Askbots" mark,
   price paid for the query. Designed to be screenshotted into a tweet.
2. **Probe timeline** — live view of a scoring run: handshake → probe calls →
   8004scan history pull → scorecard mint. Terminal-meets-timeline aesthetic.
3. **Leaderboard** — ranked scored agents.

### C. Relay directory — public catalog (agents' storefront)
- Grid of service cards + "list your service" and "pay with x402" code snippet
  blocks (copy-paste DX is part of the design).
- Empty states that sell: "No services yet in this category — be the first
  rail on the rail."

### D. Swarm control room (demo operator view)
- Start/stop swarm, agent count, tick interval; per-agent cards showing
  address (truncated), balance, last action, spend.
- A "FREE MODE / LIVE" mode switch treated as a dramatic moment in the UI —
  flipping to LIVE is the demo's money shot. Design the toggle + confirm state.

### E. TurfRun infusion (stretch, one screen)
- Overlay for the existing TurfRun hex map: agent players badged distinctly,
  their moves/wagers streaming in the ticker. Reuse dashboard tokens.

## 6. Component inventory (design-system deliverables)
- Color tokens: dark-first palette; base neutrals + Celo-compatible yellow +
  our accent(s); semantic tokens (success/settled, pending, failed, info);
  per-token colors for USDC/USDT badges.
- Type scale: display numerals (tabular), heading, body, mono for
  hashes/addresses/code.
- Core components: settlement row · big-number stat · agent chip (identicon +
  truncated address) · service card · score card/seal · tx-hash pill with
  copy + Celoscan link · token badge · mode switch (FREE/LIVE) · status dot ·
  timeline step · toast for new settlements · code snippet block · buttons,
  tabs, empty/loading/error states.
- Motion spec: settlement pulse-in, counter roll, graph edge pulse, seal stamp
  on scorecard, mode-flip transition. Fast (≤300ms), meaningful, never
  decorative-only; respect prefers-reduced-motion.

## 7. States to cover (don't skip)
For ticker & cards: empty (pre-demo) · streaming (normal) · burst (many
settlements at once — batch elegantly) · error (facilitator down) · FREE MODE
(clearly watermarked so nobody mistakes demo data for live money) · LIVE.

## 8. What "outstanding" means here (acceptance bar)
- A screenshot of the dashboard is instantly identifiable as *this* product —
  not a template, not a generic admin panel, not a Celo copy.
- The settlement ticker + graph read clearly in a compressed 720p stream.
- The Verdict score card is beautiful enough that people screenshot and post it
  unprompted.
- Every on-screen claim of "real" links to a chain artifact (tx hash → 
  Celoscan). Verifiability is a design feature.

## 9. Deliverables requested from Claude Design
1. Design tokens (CSS variables): full color/type/spacing/radius/shadow/motion.
2. The five surfaces above as high-fidelity comps (dashboard first).
3. Component sheet with all states listed in §6–7.
4. Logo/wordmark treatment for Relay + Verdict sub-brand seal.
5. Anything exportable as HTML/Tailwind-friendly specs — it returns to Claude
   Code for implementation tonight.
