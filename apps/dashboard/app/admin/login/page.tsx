"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setBusy(false);
    if (res.ok) {
      router.push(params.get("next") ?? "/admin");
      router.refresh();
    } else {
      setError("Wrong password.");
    }
  }

  return (
    <main className="shell" style={{ minHeight: "80vh", display: "grid", placeItems: "center" }}>
      <form className="seal-card" style={{ width: "min(400px, 100%)" }} onSubmit={submit}>
        <div className="eyebrow">Relay · admin</div>
        <h1 className="page-title" style={{ fontSize: 40, marginBottom: 18 }}>
          Control <span className="sig">room</span>
        </h1>
        <div className="reg-form" style={{ padding: 0, gap: 12 }}>
          <label>
            Password
            <input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </label>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "checking…" : "enter"}
          </button>
          {error && <div className="reg-result fail">{error}</div>}
        </div>
      </form>
    </main>
  );
}

export default function AdminLogin() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
