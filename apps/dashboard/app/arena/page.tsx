"use client";

// Mission Control — the livestream hero screen.
// Consumes Relay's SSE /events + /stats. Reskin via globals.css tokens.

import { useEffect, useRef, useState } from "react";
import { Nav } from "../../components/Nav";

const RELAY = process.env.NEXT_PUBLIC_RELAY_URL ?? "http://localhost:8402";
const CELOSCAN = "https://celoscan.io/tx/";

interface RelayEvent {
  type: "settlement" | "call" | "scorecard" | "service_listed";
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
      <div className="label">{label}</div>
      <div className={`value ${bumped ? "bumped" : ""}`}>{value}</div>
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
  const live = stats?.mode === "live";

  return (
    <main className="shell">
      <Nav />
      <div className="arena-head">
        <h1 className="arena-title">The Arena</h1>
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
                <li key={`${e.at}-${i}`}>
                  <span className="svc">{e.data.service}</span>
                  <span className="amt mono">${e.data.priceUsd}</span>
                  <span className="who mono">{short(e.data.payer)}</span>
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
              <span>Latest verdict</span>
              <span style={{ color: "var(--verdict)" }}>signed oracle</span>
            </div>
            {lastCard ? (
              <div className="scorecard">
                <div className="seal">
                  <span className="grade">{lastCard.data.grade}</span>
                  <div>
                    <div className="score mono">
                      {lastCard.data.score}/100
                    </div>
                    <div className="target">{lastCard.data.target}</div>
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
                  <div className="svc-meta">
                    <span className="price">${s.priceUsd}/call</span>
                    <span className="badge mono">POST {s.endpoint}</span>
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
