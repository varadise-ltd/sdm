"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 32, fontFamily: "system-ui, sans-serif" }}>
      <div>
        <h1>Something went wrong</h1>
        <p>The SDM page could not be loaded.</p>
        <button type="button" onClick={() => reset()}>Try again</button>
      </div>
    </main>
  );
}
