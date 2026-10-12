import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var sdmPool: Pool | undefined;
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for the SDM server runtime");
}

export const db =
  globalThis.sdmPool ??
  new Pool({
    connectionString: databaseUrl,
    max: 8,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.sdmPool = db;
}
