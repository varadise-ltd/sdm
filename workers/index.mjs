import pg from "pg";

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 4,
  connectionTimeoutMillis: 5000,
});

let stopping = false;

const scanMode = process.env.SDM_FILE_SCAN_MODE ?? (process.env.NODE_ENV === "development" ? "development" : "required");

async function processFileQueue() {
  if (scanMode !== "development") return;
  // Local development has no antivirus daemon. The completed upload endpoint
  // has already verified the object length; this explicit development mode
  // releases it for local workflow testing. Production must set a scanner
  // integration instead of inheriting this behavior.
  await pool.query(`
    UPDATE file_assets
       SET virus_scan_status = 'clean',
           text_index_status = CASE WHEN text_index_status = 'pending' THEN 'unsupported' ELSE text_index_status END
     WHERE virus_scan_status = 'pending'
  `);
}

async function heartbeat() {
  if (stopping) return;

  try {
    await pool.query("SELECT 1");
    await processFileQueue();
    console.log(JSON.stringify({ service: "sdm-worker", status: "ready", at: new Date().toISOString() }));
  } catch (error) {
    console.error(JSON.stringify({ service: "sdm-worker", status: "degraded", error: String(error) }));
  }
}

const interval = setInterval(heartbeat, 5_000);
await heartbeat();

async function shutdown(signal) {
  stopping = true;
  clearInterval(interval);
  console.log(JSON.stringify({ service: "sdm-worker", status: "stopping", signal }));
  await pool.end();
  process.exit(0);
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
