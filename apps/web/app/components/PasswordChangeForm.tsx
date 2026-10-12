"use client";

import { useState } from "react";

export default function PasswordChangeForm({ onNotify }: { onNotify?: (message: string) => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    setError("");
    if (newPassword !== confirmPassword) { setError("Passwords do not match"); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/password", { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ currentPassword, newPassword }) });
      const payload = await response.json().catch(() => ({})) as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Password could not be changed");
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      onNotify?.("Password changed. Sign in again if your session expires.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Password could not be changed"); }
    finally { setBusy(false); }
  }
  return <div className="password-change"><strong>Change local password</strong><span className="field-hint">At least 8 characters with uppercase, lowercase, and a special character.</span>{error && <div className="data-state error" role="alert">{error}</div>}<label className="field-label">Current password<input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label><label className="field-label">New password<input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label><label className="field-label">Confirm new password<input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label><button className="button secondary" disabled={busy || !currentPassword || !newPassword || !confirmPassword} onClick={() => void submit()}>{busy ? "Changing…" : "Change password"}</button></div>;
}
