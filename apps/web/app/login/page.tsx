"use client";

import { FormEvent, useEffect, useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<string>("local");
  const [next, setNext] = useState("/");

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("next") ?? "/";
    setNext(requested.startsWith("/") && !requested.startsWith("//") ? requested : "/");
    void fetch("/api/auth/config", { cache: "no-store" })
      .then((response) => response.json() as Promise<{ data?: { mode?: string } }>)
      .then((payload) => setMode(payload.data?.mode ?? "local"))
      .catch(() => undefined);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ email, password }) });
      const payload = await response.json().catch(() => ({})) as { error?: { message?: string }; data?: unknown };
      if (!response.ok) throw new Error(payload.error?.message ?? "Sign-in failed");
      window.location.assign(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign-in failed");
    } finally { setBusy(false); }
  }

  return <main className="login-shell"><section className="login-card" aria-labelledby="login-title"><div className="eyebrow">COSMOS DRIVE HUB · SDM</div><h1 id="login-title">Sign in</h1><p className="modal-copy">Use your SDM local account to access project documents and workflows.</p>{mode !== "local" && mode !== "development" && <div className="data-state">This environment uses its configured identity provider.</div>}{error && <div className="data-state error" role="alert">{error}</div>}<form onSubmit={submit} className="login-form"><label className="field-label">Email<input type="email" required autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label className="field-label">Password<input type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label><button className="button primary" disabled={busy || !email || !password} type="submit">{busy ? "Signing in…" : "Sign in"}</button></form><p className="field-hint">Local passwords require at least 8 characters, including uppercase, lowercase, and a special character.</p></section></main>;
}
