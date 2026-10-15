export async function waitForApp(base) {
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(new URL("/api/health", base), { signal: AbortSignal.timeout(15000) });
      if (response.ok) return;
    } catch { /* Docker/Next may still be starting after a local restart. */ }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(`The local SDM app did not become ready at ${base}`);
}
