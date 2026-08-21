/**
 * AgencyOps backend supervisor.
 *
 * Runs the real server as a child process, writes its output to logs/server.log
 * (so nothing is lost when a terminal dies), polls /api/health every few
 * seconds, and restarts the child if it hangs (the worker-thread watchdog
 * force-exits the hung process with code 42, which we detect here and bring
 * back up automatically).
 */
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = path.join(__dirname, '..');
const LOG_DIR = path.join(BACKEND_DIR, 'logs');
fs.mkdirSync(LOG_DIR, { recursive: true });

const logFile = fs.createWriteStream(path.join(LOG_DIR, 'server.log'), { flags: 'a' });
const stamp = () => new Date().toISOString();

function say(line) {
  const line2 = `[${stamp()}] ${line}\n`;
  process.stdout.write(line2);
  logFile.write(line2);
}

let child = null;
let restartDelay = 1000;
let shuttingDown = false;

function start() {
  say(`[supervisor] starting backend (node src/index.js)`);
  child = spawn(process.execPath, ['src/index.js'], {
    cwd: BACKEND_DIR,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => {
    process.stdout.write(d);
    logFile.write(d);
  });
  child.stderr.on('data', (d) => {
    process.stderr.write(d);
    logFile.write(d);
  });
  child.on('exit', (code, signal) => {
    const wasHang = code === 42;
    say(`[supervisor] backend exited (code=${code} signal=${signal}${wasHang ? ' — HANG DETECTED' : ''}). Restarting in ${restartDelay}ms.`);
    if (shuttingDown) return;
    setTimeout(start, restartDelay);
    // Back off up to 15s between restarts to avoid a tight crash loop.
    restartDelay = Math.min(15000, restartDelay * 2);
  });
  child.on('spawn', () => {
    restartDelay = 1000;
  });
}

async function healthOk() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch('http://localhost:4000/api/health', { signal: ctrl.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

async function monitor() {
  let misses = 0;
  while (!shuttingDown) {
    await new Promise((r) => setTimeout(r, 3000));
    if (!child || child.exitCode !== null) continue; // supervisor is (re)starting it
    const ok = await healthOk();
    if (ok) {
      misses = 0;
      continue;
    }
    misses++;
    if (misses >= 3) {
      say(`[supervisor] health check failed ${misses}x — backend is unresponsive. Killing it (watchdog/supervisor will restart).`);
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
      misses = 0;
    }
  }
}

function shutdown() {
  shuttingDown = true;
  say('[supervisor] shutting down.');
  if (child) { try { child.kill('SIGTERM'); } catch { /* noop */ } }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

start();
monitor();
