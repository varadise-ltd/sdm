"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const pathname = usePathname() ?? "/";
  const isLogin = pathname.startsWith("/login");
  useEffect(() => {
    if (isLogin) { setChecking(false); return; }
    setChecking(true); setError("");
    let cancelled = false;
    void fetch("/api/me", { credentials: "include", cache: "no-store" })
      .then(async (response) => {
        if (response.ok) { if (!cancelled) setChecking(false); return; }
        if (response.status !== 401) throw new Error("Your SDM session could not be checked. Please retry.");
        const config = await fetch("/api/auth/config", { cache: "no-store" }).then((item) => item.ok ? item.json() as Promise<{ data?: { mode?: string } }> : ({ data: {} as { mode?: string } })).catch(() => ({ data: {} as { mode?: string } }));
        if (cancelled) return;
        if (config.data?.mode === "oidc") window.location.assign(`/api/auth/oidc/start?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
        else window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Your SDM session could not be checked"); });
    return () => { cancelled = true; };
  }, [pathname, isLogin]);
  // The server and first client render must agree; branching on window here
  // caused React to discard and rebuild the whole application during sign-in.
  if (!isLogin && error) return <main className="auth-gate"><div className="auth-gate-card" role="alert">{error}<button className="button secondary" onClick={() => window.location.reload()}>Retry</button></div></main>;
  if (checking && !isLogin) return <main className="auth-gate"><div className="auth-gate-card" role="status">Checking your SDM session…</div></main>;
  return <>{children}</>;
}
