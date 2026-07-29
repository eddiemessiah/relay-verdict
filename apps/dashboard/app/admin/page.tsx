"use client";

// Admin control room — operator overview of the whole platform. Gated by
// middleware (cookie auth). Reads live state from the Relay rail.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Nav } from "../../components/Nav";

const RELAY = process.env.NEXT_PUBLIC_RELAY_URL ?? "http://localhost:8402";

interface Stats {
  settlements: number;
  volumeUsd: number;
  calls: number;
  services: number;
  registrations?: number;
  mode: "free" | "live";
  payTo: string | null;
  verdictIssuer: string;
}
interface Ev { type: string; at: number; data: Record<string, any> }
interface Service { id: string; name: string; priceUsd: string; external?: boolean; verdict?: { grade: string; score: number } }

// v2 roadmap — EDIT THESE: your "coming soon" use cases live here.
const V2 = [
  { tag: "onchain", title: "Reputation to ERC-8004, live", body: "Every Verdict score auto-published to the Reputation Registry as it's minted, so Aigora bidders see it instantly." },
  { tag: "payments", title: "Agent subscriptions", body: "Recurring x402 pulls so an agent can retain another agent monthly, not just per-call." },
  { tag: "trust", title: "Staked listings", body: "Agents post a USDT bond to list; Verdict slashes it on proven bad behavior. Skin in the game." },
  { tag: "distribution", title: "MiniPay storefront", body: "Human-facing front door: browse and hire agents from the 16M-user MiniPay wallet." },
];

function short(x?: string | null, n = 6) {
  if (!x) return "—";
  return x.length > 2 * n ? `${x.slice(0, n)}…${x.slice(-4)}` : x;
}

export default function Admin() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [events, setEvents] = useState<Ev[]>([]);
  const [reachable, setReachable] = useState<boolean | null>(null);
  const esRef = useRef<EventSource | null>(null);

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
          setReachable(true);
        }
      } catch {
        if (!stop) setReachable(false);
      }
      if (!stop) setTimeout(tick, 4000);
    }
    tick();
    try {
      const es = new EventSource(`${RELAY}/events`);
      esRef.current = es;
      es.onmessage = (m) => {
        try {
          setEvents((prev) => [JSON.parse(m.data), ...prev].slice(0, 40));
        } catch {}
      };
    } catch {}
    return () => {
      stop = true;
      esRef.current?.close();
    };
  }, []);

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  const live = stats?.mode === "live";

  return (
    <main className="shell">
      <Nav />
      <div className="page-head">
        <h1 className="page-title">
          Control <span className="sig">room</span>
        </h1>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div className={`mode-pill ${live ? "mode-live" : "mode-free"}`}>
            <span className="dot" />
            {reachable === false ? "RAIL OFFLINE" : live ? "LIVE · MAINNET" : "FREE MODE"}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={logout}>
            log out
          </button>
        </div>
      </div>

      {reachable === false && (
        <div className="reg-result fail" style={{ marginBottom: 20 }}>
          Relay rail not reachable at {RELAY}. Start it (or set
          NEXT_PUBLIC_RELAY_URL to the deployed rail) to see live data.
        </div>
      )}

      <section className="counters">
        <div className="counter">
          <div className="counter-num tnum">{stats?.settlements ?? 0}</div>
          <div className="counter-label">Settlements</div>
        </div>
        <div className="counter gold">
          <div className="counter-num tnum">${(stats?.volumeUsd ?? 0).toFixed(3)}</div>
          <div className="counter-label">Volume settled</div>
        </div>
        <div className="counter">
          <div className="counter-num tnum">{stats?.registrations ?? 0}</div>
          <div className="counter-label">Agents registered</div>
        </div>
        <div className="counter">
          <div className="counter-num tnum">{stats?.services ?? 0}</div>
          <div className="counter-label">Services listed</div>
        </div>
      </section>

      <div className="grid grid-main" style={{ marginTop: 20 }}>
        {/* live event feed — every type */}
        <section className="panel">
          <div className="panel-head">
            <span>Live event feed</span>
            <span>{events.length} recent</span>
          </div>
          {events.length === 0 ? (
            <div className="empty">Waiting for events…</div>
          ) : (
            <ul className="ticker">
              {events.map((e, i) => (
                <li className="trow" key={`${e.at}-${i}`} style={{ listStyle: "none" }}>
                  <span className="badge" style={{ minWidth: 118, textAlign: "center" }}>
                    {e.type}
                  </span>
                  <div className="trow-main">
                    <div className="trow-hash" style={{ marginTop: 0, color: "var(--ink-soft)" }}>
                      {e.type === "crier.announcement"
                        ? e.data.message
                        : e.type === "settlement"
                          ? `${e.data.service} · $${e.data.priceUsd} · ${short(e.data.payer)}`
                          : e.type.startsWith("agent.")
                            ? `${e.data.agent?.name ?? e.data.name ?? ""} ${e.data.scorecard ? `· ${e.data.scorecard.grade}·${e.data.scorecard.score}` : ""} ${e.data.status ?? ""}`
                            : JSON.stringify(e.data).slice(0, 60)}
                    </div>
                  </div>
                  <span className="trow-hash">{new Date(e.at).toLocaleTimeString()}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="grid">
          {/* chain config */}
          <section className="panel">
            <div className="panel-head">
              <span>Chain config</span>
            </div>
            <div style={{ padding: 16, display: "grid", gap: 10, fontFamily: "var(--font-m)", fontSize: 12.5 }}>
              <Row k="mode" v={live ? "LIVE · mainnet" : "FREE MODE · demo"} />
              <Row k="network" v="Celo · eip155:42220" />
              <Row k="facilitator" v="x402.celo.org" />
              <Row k="payTo" v={short(stats?.payTo, 10)} />
              <Row k="verdict issuer" v={short(stats?.verdictIssuer, 10)} />
              <Row
                k="attribution tag"
                v={process.env.NEXT_PUBLIC_ATTRIBUTION_TAG ? "set ✓" : "unset ✗"}
              />
            </div>
          </section>

          {/* listings */}
          <section className="panel">
            <div className="panel-head">
              <span>Listings</span>
              <span>{services.length}</span>
            </div>
            <div style={{ maxHeight: 240, overflowY: "auto" }}>
              {services.map((s) => (
                <div key={s.id} className="trow" style={{ listStyle: "none" }}>
                  <div className="trow-main">
                    <div className="trow-who">
                      {s.name} {s.external && <span className="badge ext">community</span>}
                    </div>
                    <div className="trow-hash">${s.priceUsd}/call</div>
                  </div>
                  {s.verdict && (
                    <span className="verdict-badge badge tnum">
                      {s.verdict.grade}·{s.verdict.score}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* v2 roadmap */}
      <section className="section" style={{ paddingTop: 60 }}>
        <div className="eyebrow">Coming in v2</div>
        <h2 className="h2">
          What we build <span className="sig">next</span>
        </h2>
        <div className="dir-grid" style={{ marginTop: 32 }}>
          {V2.map((v) => (
            <article className="svc-card" key={v.title}>
              <div className="svc-top">
                <span className="badge ext">{v.tag}</span>
              </div>
              <h3>{v.title}</h3>
              <p>{v.body}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span style={{ color: "var(--ink-faint)" }}>{k}</span>
      <span style={{ color: "var(--ink)" }}>{v}</span>
    </div>
  );
}
