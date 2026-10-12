"use client";

import { useEffect, useState } from "react";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    if (window.location.pathname.startsWith("/login")) { setChecking(false); return; }
    let cancelled = false;
    void fetch("/api/me", { credentials: "include", cache: "no-store" })
      .then(async (response) => {
        if (response.ok) { if (!cancelled) setChecking(false); return; }
        if (response.status !== 401) { if (!cancelled) setChecking(false); return; }
        const config = await fetch("/api/auth/config", { cache: "no-store" }).then((item) => item.ok ? item.json() as Promise<{ data?: { mode?: string } }> : ({ data: {} as { mode?: string } })).catch(() => ({ data: {} as { mode?: string } }));
        if (cancelled) return;
        if (config.data?.mode === "oidc") window.location.assign(`/api/auth/oidc/start?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
        else window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      })
      .catch(() => { if (!cancelled) setChecking(false); });
    return () => { cancelled = true; };
  }, []);
  if (checking && typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) return <main className="auth-gate"><div className="auth-gate-card">Checking your SDM session…</div></main>;
  return <>{children}</>;
}
