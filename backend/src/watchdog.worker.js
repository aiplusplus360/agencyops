import { parentPort } from 'worker_threads';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_FILE = path.join(__dirname, '..', 'logs', 'watchdog.log');
const HANG_WARN_MS = 5_000;   // log a warning after this much unresponsiveness
const HANG_EXIT_MS = 30_000;  // force-exit the process after this much unresponsiveness

let lastAck = Date.now();
let hangSince = null;
let warned = false;

parentPort.on('message', (msg) => {
  if (msg?.type === 'ack') lastAck = Date.now();
});

function log(line) {
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${line}\n`);
  } catch {
    /* best effort */
  }
}

// Ping the main thread every second. If the main event loop is blocked, the
// ack never comes back and we can report it — even a permanent block.
setInterval(() => {
  parentPort.postMessage({ type: 'ping' });
}, 1000).unref();

setInterval(() => {
  const silentFor = Date.now() - lastAck;
  if (silentFor < 2_000) {
    hangSince = null;
    warned = false;
    return;
  }
  if (!hangSince) hangSince = Date.now();
  const continuous = Date.now() - hangSince;

  if (continuous >= HANG_WARN_MS && !warned) {
    warned = true;
    log(`MAIN EVENT LOOP UNRESPONSIVE: no ack for ${Math.round(silentFor / 1000)}s (continuous ${Math.round(continuous / 1000)}s). The backend is stuck in a synchronous block.`);
  }

  if (continuous >= HANG_EXIT_MS) {
    log(`FORCE-EXITING after ${Math.round(continuous / 1000)}s of event-loop block so the supervisor can restart the backend.`);
    process.exit(42);
  }
}, 2_000).unref();
