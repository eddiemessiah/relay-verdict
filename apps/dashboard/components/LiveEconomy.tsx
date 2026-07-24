"use client";

// Hero ticker + counters. Streams real Relay settlements over SSE; when the
// rail is unreachable (marketing deploy without a backend) it degrades to a
// clearly-labeled simulated feed so the page still breathes.

import { useEffect, useRef, useState } from "react";

const RELAY = process.env.NEXT_PUBLIC_RELAY_URL ?? "http://localhost:8402";
const CELOSCAN = "https://celoscan.io/tx/";

const AGENTS = ["Lagos-Node", "Naija-Scout", "AbujaBot", "OjaAgent", "MarketMind", "PalmSwift", "EkoTrader", "KanoRelay", "JollofAI", "ArewaBot"];
const SERVICES = ["Price Oracle", "FX Rate", "Fraud Check", "Route Pay", "Translate", "Verdict Score", "Data Pull", "Airtime Top-up"];
const AVATARS = [
  "linear-gradient(135deg,#FFC46B,#FF5E8A)",
  "linear-gradient(135deg,#8B5CF6,#3FD9C9)",
  "linear-gradient(135deg,#3FD9A8,#8B5CF6)",
  "linear-gradient(135deg,#FF5E8A,#8B5CF6)",
  "linear-gradient(135deg,#3FD9C9,#3FD9A8)",
  "linear-gradient(135deg,#FBE39A,#FF7FA6)",
];
const TOKENS = [
  { t: "USDT", c: "#5CD6B0", b: "rgba(38,161,123,0.20)" },
  { t: "USDC", c: "#8FC0FF", b: "rgba(39,117,202,0.18)" },
];

interface Row {
  id: string;
  from: string;
  service: string;
  amount: string;
  token: (typeof TOKENS)[number];
  avatar: string;
  hash: string;
  tx?: string;
  t: number;
  live: boolean;
}

const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
const hex = (n: number) => {
  let s = "";
  for (let i = 0; i < n; i++) s += "0123456789abcdef"[Math.floor(Math.random() * 16)];
  return s;
};

function simRow(): Row {
  const amt = Math.random() * 0.48 + 0.002;
  return {
    id: Math.random().toString(36).slice(2),
    from: pick(AGENTS),
    service: pick(SERVICES),
    amount: "$" + amt.toFixed(amt < 0.01 ? 4 : 3),
    token: Math.random() < 0.82 ? TOKENS[0] : TOKENS[1],
    avatar: pick(AVATARS),
    hash: "0x" + hex(6) + "…" + hex(4),
    t: Date.now(),
    live: false,
  };
}

function age(t: number, now: number) {
  const d = Math.max(0, Math.round((now - t) / 1000));
  return d < 2 ? "now" : d < 90 ? `${d}s ago` : `${Math.round(d / 60)}m ago`;
}

export function LiveEconomy() {
  const [rows, setRows] = useState<Row[]>([]);
  const [counts, setCounts] = useState({ s: 1240, v: 18240, a: 84, srv: 37 });
  const [source, setSource] = useState<"connecting" | "live" | "demo">("connecting");
  const [now, setNow] = useState(() => Date.now());
  const gotReal = useRef(false);

  // clock for "Ns ago"
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // real SSE first
  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource(`${RELAY}/events`);
      es.onmessage = (m) => {
        try {
          const ev = JSON.parse(m.data);
          if (ev.type !== "settlement") return;
          gotReal.current = true;
          setSource("live");
          const amt = Number(ev.data.priceUsd ?? 0);
          setRows((prev) =>
            [
              {
                id: `${ev.at}-${Math.random()}`,
                from: typeof ev.data.payer === "string" && ev.data.payer.startsWith("0x")
                  ? `${ev.data.payer.slice(0, 6)}…${ev.data.payer.slice(-4)}`
                  : "agent",
                service: String(ev.data.service ?? "service"),
                amount: "$" + amt.toFixed(amt < 0.01 ? 4 : 3),
                token: TOKENS[0],
                avatar: pick(AVATARS),
                hash: typeof ev.data.transaction === "string" && ev.data.transaction.length > 14
                  ? `${ev.data.transaction.slice(0, 8)}…${ev.data.transaction.slice(-4)}`
                  : String(ev.data.transaction ?? ""),
                tx: ev.data.mode === "live" ? String(ev.data.transaction) : undefined,
                t: ev.at,
                live: true,
              },
              ...prev,
            ].slice(0, 7),
          );
          setCounts((c) => ({ ...c, s: c.s + 1, v: c.v + amt }));
        } catch {}
      };
      es.onerror = () => {
        if (!gotReal.current) setSource((s) => (s === "live" ? s : "demo"));
      };
    } catch {
      setSource("demo");
    }
    // if nothing real arrives quickly, start the demo feed
    const fallback = setTimeout(() => {
      if (!gotReal.current) setSource("demo");
    }, 2500);
    return () => {
      es?.close();
      clearTimeout(fallback);
    };
  }, []);

  // simulated feed (only while in demo mode)
  useEffect(() => {
    if (source !== "demo") return;
    setRows((prev) => (prev.length ? prev : Array.from({ length: 6 }, simRow)));
    const t = setInterval(() => {
      if (gotReal.current) return;
      const r = simRow();
      setRows((prev) => [r, ...prev].slice(0, 7));
      setCounts((c) => ({
        s: c.s + 1,
        v: c.v + Number(r.amount.slice(1)),
        a: Math.max(60, Math.min(140, c.a + (Math.random() < 0.5 ? -1 : 1))),
        srv: c.srv + (Math.random() < 0.12 ? 1 : 0),
      }));
    }, 1700);
    return () => clearInterval(t);
  }, [source]);

  const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

  return (
    <>
      <div className="ticker-glass">
        <div className="ticker-head">
          <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span className="dot dot-pulse" />
            SETTLEMENT FEED · x402
          </span>
          <span className="mode">{source === "live" ? "live" : source === "demo" ? "demo" : "…"}</span>
        </div>
        {rows.map((r, i) => (
          <div className="trow" key={r.id}>
            {i === 0 && <span className="trow-new" />}
            <div className="trow-avatar" style={{ background: r.avatar }} />
            <div className="trow-main">
              <div className="trow-who">
                {r.from} <span className="sep">→</span> {r.service}
              </div>
              <div className="trow-hash tnum">
                {r.tx ? (
                  <a href={`${CELOSCAN}${r.tx}`} target="_blank" rel="noreferrer">
                    {r.hash} ↗
                  </a>
                ) : (
                  r.hash
                )}{" "}
                · {age(r.t, now)}
              </div>
            </div>
            <div className="trow-amt">
              <div className="trow-usd tnum">{r.amount}</div>
              <span className="trow-tok" style={{ color: r.token.c, background: r.token.b }}>
                {r.token.t}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="counters">
        <div className="counter">
          <div className="counter-num tnum">{fmt(counts.s)}</div>
          <div className="counter-label">Settlements today</div>
        </div>
        <div className="counter gold">
          <div className="counter-num tnum">${fmt(counts.v)}</div>
          <div className="counter-label tnum">Settled · ≈ ₦{fmt(counts.v * 1612)}</div>
        </div>
        <div className="counter">
          <div className="counter-num tnum">{fmt(counts.a)}</div>
          <div className="counter-label">Agents live now</div>
        </div>
        <div className="counter">
          <div className="counter-num tnum">{fmt(counts.srv)}</div>
          <div className="counter-label">Services listed</div>
        </div>
      </div>
    </>
  );
}
