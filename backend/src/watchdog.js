import { Worker } from 'worker_threads';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './lib/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let worker = null;

/**
 * Start an out-of-band event-loop watchdog.
 *
 * The in-process `setInterval` watchdog can't detect a PERMANENT event-loop
 * block: once the loop is stuck, no timer or setImmediate callback ever runs.
 * This watchdog runs the probe in a worker thread, which has its own event
 * loop. The worker pings the main thread and expects an ack; if the main
 * thread never acks, the worker logs to a persistent file (surviving terminal
 * loss) and hard-exits the process so the supervisor can restart it.
 */
export function startWatchdog() {
  if (worker) return;
  worker = new Worker(path.join(__dirname, 'watchdog.worker.js'));
  worker.on('message', (msg) => {
    if (msg?.type === 'ping') {
      worker.postMessage({ type: 'ack' });
    }
  });
  worker.on('error', (e) => logger.error('[watchdog] worker error:', e?.message));
  worker.on('exit', (code) => {
    worker = null;
    if (code !== 0) logger.error(`[watchdog] worker exited with code ${code}`);
  });
  logger.info('[watchdog] worker-thread watchdog started.');
}
