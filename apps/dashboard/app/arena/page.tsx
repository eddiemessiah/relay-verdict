"use client";

// Mission Control — the livestream hero screen.
// Consumes Relay's SSE /events + /stats. Reskin via globals.css tokens.

import { useEffect, useRef, useState } from "react";
import { Nav } from "../../components/Nav";

const RELAY = process.env.NEXT_PUBLIC_RELAY_URL ?? "http://localhost:8402";
const CELOSCAN = "https://celoscan.io/tx/";

interface RelayEvent {
  type:
    | "settlement"
    | "call"
    | "scorecard"
    | "service_listed"
    | "agent.registering"
    | "agent.registered"
    | "crier.announcement";
  at: number;
  data: Record<string, any>;
}
interface Stats {
  settlements: number;
  volumeUsd: number;
  calls: number;
  services: number;
  mode: "free" | "live";
  payTo: string | null;
  verdictIssuer: string;
}
interface Service {
  id: string;
  name: string;
  description: string;
  priceUsd: string;
  endpoint: string;
}

function short(x?: string | null, n = 6) {
  if (!x) return "—";
  return x.length > 2 * n ? `${x.slice(0, n)}…${x.slice(-4)}` : x;
}

function Counter({ label, value }: { label: string; value: string | number }) {
  const [bumped, setBumped] = useState(false);
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current !== value) {
      prev.current = value;
      setBumped(true);
      const t = setTimeout(() => setBumped(false), 320);
      return () => clearTimeout(t);
    }
  }, [value]);
  return (
    <div className="counter">
      <div
        className="counter-num tnum"
        style={bumped ? { color: "var(--gold-hi)", transition: "color 0.3s" } : { transition: "color 0.6s" }}
      >
        {value}
      </div>
      <div className="counter-label">{label}</div>
    </div>
  );
}

export default function Dashboard() {
  const [events, setEvents] = useState<RelayEvent[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [connected, setConnected] = useState(false);

  // SSE feed
  useEffect(() => {
    const es = new EventSource(`${RELAY}/events`);
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (m) => {
      try {
        const ev: RelayEvent = JSON.parse(m.data);
        setEvents((prev) => [ev, ...prev].slice(0, 80));
      } catch {}
    };
    return () => es.close();
  }, []);

  // stats + directory polling
  useEffect(() => {
    let stop = false;
    async function tick() {
      try {
        const [s, d] = await Promise.all([
          fetch(`${RELAY}/stats`).then((r) => r.json()),
          fetch(`${RELAY}/services`).then((r) => r.json()),
        ]);
        if (!stop) {
          setStats(s);
          setServices(d.services ?? []);
        }
      } catch {}
      if (!stop) setTimeout(tick, 3000);
    }
    tick();
    return () => {
      stop = true;
    };
  }, []);

  const settlements = events.filter((e) => e.type === "settlement");
  const lastCard = events.find((e) => e.type === "scorecard");
  const townSquare = events.filter(
    (e) =>
      e.type === "crier.announcement" ||
      e.type === "agent.registered" ||
      e.type === "agent.registering",
  );
  const live = stats?.mode === "live";

  return (
    <main className="shell">
      <Nav />
      <div className="page-head">
        <h1 className="page-title">
          The <span className="it">Arena</span>
        </h1>
        <div className={`mode-pill ${live ? "mode-live" : "mode-free"}`}>
          <span className={`dot ${connected ? "dot-pulse" : ""}`} />
          {live ? "LIVE · CELO MAINNET" : "FREE MODE · DEMO"}
        </div>
      </div>

      <section className="counters">
        <Counter label="Settlements" value={stats?.settlements ?? 0} />
        <Counter
          label="Volume"
          value={`$${(stats?.volumeUsd ?? 0).toFixed(3)}`}
        />
        <Counter label="Paid calls" value={stats?.calls ?? 0} />
        <Counter label="Services" value={stats?.services ?? 0} />
      </section>

      <div className="grid grid-main">
        <section className="panel">
          <div className="panel-head">
            <span>Settlement ticker</span>
            <span>{connected ? "streaming" : "reconnecting…"}</span>
          </div>
          {settlements.length === 0 ? (
            <div className="empty">
              No settlements yet — the swarm hasn&apos;t started. Run{" "}
              <code className="mono">npm run swarm</code>.
            </div>
          ) : (
            <ul className="ticker">
              {settlements.map((e, i) => (
                <li className="trow" key={`${e.at}-${i}`} style={{ listStyle: "none" }}>
                  {i === 0 && <span className="trow-new" />}
                  <div className="trow-main">
                    <div className="trow-who">
                      {short(e.data.payer)} <span className="sep">→</span>{" "}
                      {e.data.service}
                    </div>
                    <div className="trow-hash tnum">
                      {new Date(e.at).toLocaleTimeString()}
                    </div>
                  </div>
                  <span className="trow-usd tnum">${e.data.priceUsd}</span>
                  {e.data.mode === "live" ? (
                    <a
                      className="txpill"
                      href={`${CELOSCAN}${e.data.transaction}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {short(e.data.transaction, 8)} ↗
                    </a>
                  ) : (
                    <span className="txpill free">demo</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="grid">
          <section className="panel">
            <div className="panel-head">
              <span>📣 Town Square</span>
              <span>new agents in town</span>
            </div>
            {townSquare.length === 0 ? (
              <div className="empty">
                No new agents yet. Run{" "}
                <code className="mono">town-crier</code> + register one.
              </div>
            ) : (
              <ul className="ticker" style={{ maxHeight: 260 }}>
                {townSquare.slice(0, 30).map((e, i) => {
                  if (e.type === "crier.announcement") {
                    return (
                      <li className="trow" key={`${e.at}-${i}`} style={{ listStyle: "none", background: "rgba(244,80,12,0.05)" }}>
                        <span className="trow-new" />
                        <div className="trow-main">
                          <div className="trow-who" style={{ whiteSpace: "normal" }}>
                            {e.data.message}
                          </div>
                          <div className="trow-hash">via Town Crier</div>
                        </div>
                      </li>
                    );
                  }
                  const a = e.data.agent ?? {};
                  const sc = e.data.scorecard ?? {};
                  const registering = e.type === "agent.registering";
                  const rejected = e.data.status === "rejected";
                  return (
                    <li className="trow" key={`${e.at}-${i}`} style={{ listStyle: "none" }}>
                      <div className="trow-avatar" />
                      <div className="trow-main">
                        <div className="trow-who">
                          {a.name ?? e.data.name}{" "}
                          <span className="sep">
                            {registering ? "· probing…" : rejected ? "· rejected" : "· joined"}
                          </span>
                        </div>
                        <div className="trow-hash">
                          {registering ? "Verdict is scoring" : (a.description ?? "").slice(0, 44)}
                        </div>
                      </div>
                      {!registering && (
                        <span
                          className="txpill"
                          style={rejected ? { color: "var(--orange)", borderColor: "var(--orange)" } : {}}
                        >
                          {sc.grade}·{sc.score}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="panel">
            <div className="panel-head">
              <span>Latest verdict</span>
              <span style={{ color: "var(--violet-hi)" }}>signed oracle</span>
            </div>
            {lastCard ? (
              <div style={{ padding: 20, display: "flex", alignItems: "center", gap: 18 }}>
                <span
                  style={{
                    fontFamily: "var(--font-d)",
                    fontWeight: 800,
                    fontSize: 46,
                    color: "var(--gold-hi)",
                    border: "2px solid rgba(242,206,123,0.5)",
                    borderRadius: 14,
                    padding: "2px 18px",
                    transform: "rotate(-3deg)",
                    display: "inline-block",
                  }}
                >
                  {lastCard.data.grade}
                </span>
                <div>
                  <div className="tnum" style={{ fontFamily: "var(--font-d)", fontSize: 24, fontWeight: 700 }}>
                    {lastCard.data.score}/100
                  </div>
                  <div className="mono" style={{ fontSize: 11.5, color: "var(--ink-faint)", wordBreak: "break-all", marginTop: 4 }}>
                    {lastCard.data.target}
                  </div>
                </div>
              </div>
            ) : (
              <div className="empty">
                No scorecards yet — run{" "}
                <code className="mono">npx tsx scripts/buy-verdict.ts</code>.
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel-head">
              <span>Service directory</span>
              <span>{services.length} listed</span>
            </div>
            <div className="svc-grid">
              {services.map((s) => (
                <article className="svc-card" key={s.id}>
                  <h3>{s.name}</h3>
                  <p>{s.description}</p>
                  <div className="svc-foot">
                    <span className="price tnum">${s.priceUsd}/call</span>
                    <span className="badge svc-endpoint">POST {s.endpoint}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </div>

      <footer className="chainstrip">
        <span>
          chain <strong>Celo · eip155:42220</strong>
        </span>
        <span>
          facilitator <strong>x402.celo.org</strong>
        </span>
        <span>
          payTo <strong>{short(stats?.payTo, 8)}</strong>
        </span>
        <span>
          verdict issuer <strong>{short(stats?.verdictIssuer, 8)}</strong>
        </span>
        <span>
          attribution{" "}
          <strong>
            {process.env.NEXT_PUBLIC_ATTRIBUTION_TAG ? "tagged ✓" : "unset"}
          </strong>
        </span>
      </footer>
    </main>
  );
}
