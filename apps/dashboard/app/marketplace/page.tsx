"use client";

// Marketplace — the directory agents shop from, plus the bring-your-agent
// flow: any builder lists an x402 endpoint; Verdict probes it as the
// admission test and the scorecard becomes the listing's trust badge.

import { useEffect, useState } from "react";
import { Nav } from "../../components/Nav";

const RELAY = process.env.NEXT_PUBLIC_RELAY_URL ?? "http://localhost:8402";

interface Service {
  id: string;
  name: string;
  description: string;
  priceUsd: string;
  endpoint: string;
  external?: boolean;
  verdict?: { score: number; grade: string };
}

export default function Marketplace() {
  const [services, setServices] = useState<Service[]>([]);
  const [form, setForm] = useState({ name: "", endpoint: "", description: "" });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<null | { ok: boolean; msg: string; card?: any }>(null);

  async function load() {
    try {
      const d = await fetch(`${RELAY}/services`).then((r) => r.json());
      setServices(d.services ?? []);
    } catch {}
  }
  useEffect(() => {
    load();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch(`${RELAY}/agents/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) {
        setResult({
          ok: true,
          msg: `Listed. Verdict admission score: ${data.verdict.grade} · ${data.verdict.score}/100`,
          card: data.verdict,
        });
        setForm({ name: "", endpoint: "", description: "" });
        load();
      } else {
        setResult({ ok: false, msg: data.error ?? "Registration failed" });
      }
    } catch (err) {
      setResult({ ok: false, msg: "Relay unreachable" });
    }
    setSubmitting(false);
  }

  return (
    <main className="shell">
      <Nav />

      <section className="hero hero-sm">
        <h1>
          The agent <span className="hl">marketplace</span>
        </h1>
        <p className="sub">
          Every listing is a metered x402 endpoint on Celo. Every trust badge is
          an evidence-backed Verdict score. Buy with one HTTP call.
        </p>
      </section>

      <div className="grid grid-main">
        <section className="panel">
          <div className="panel-head">
            <span>Listings</span>
            <span>{services.length} live</span>
          </div>
          <div className="svc-grid">
            {services.map((s) => (
              <article className="svc-card" key={s.id}>
                <h3>
                  {s.name}
                  {s.external && <span className="badge ext">community</span>}
                </h3>
                <p>{s.description}</p>
                <div className="svc-meta">
                  <span className="price">${s.priceUsd}/call</span>
                  <span className="badge mono">POST {s.endpoint}</span>
                  {s.verdict && (
                    <span className="badge verdict-badge mono">
                      {s.verdict.grade} · {s.verdict.score}
                    </span>
                  )}
                </div>
              </article>
            ))}
            {services.length === 0 && (
              <div className="empty">Relay unreachable — start the rail.</div>
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <span>Bring your agent</span>
            <span style={{ color: "var(--verdict)" }}>Verdict-gated</span>
          </div>
          <form className="reg-form" onSubmit={submit}>
            <p className="form-note">
              Built an agent for the hackathon? List its x402 endpoint here.
              Verdict probes it live — the scorecard is your admission badge and
              your listing's trust signal. Passing agents earn from every call.
            </p>
            <label>
              Agent / service name
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. LagosFX Oracle"
              />
            </label>
            <label>
              x402 endpoint URL
              <input
                required
                type="url"
                value={form.endpoint}
                onChange={(e) => setForm({ ...form, endpoint: e.target.value })}
                placeholder="https://your-agent.app/api/quote"
              />
            </label>
            <label>
              What does one paid call deliver?
              <textarea
                required
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Concrete deliverable per call — Verdict checks this."
              />
            </label>
            <button className="btn btn-primary" disabled={submitting}>
              {submitting ? "Verdict is probing…" : "Submit for admission"}
            </button>
            {result && (
              <div className={`reg-result ${result.ok ? "ok" : "fail"}`}>
                {result.msg}
                {result.card && (
                  <ul className="evidence" style={{ marginTop: 8 }}>
                    {result.card.evidence?.map((ev: any) => (
                      <li key={ev.check}>
                        <span className={`mark ${ev.pass ? "ok" : "no"}`}>
                          {ev.pass ? "✓" : "✗"}
                        </span>
                        {ev.check}: {ev.detail}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </form>
        </section>
      </div>
    </main>
  );
}
