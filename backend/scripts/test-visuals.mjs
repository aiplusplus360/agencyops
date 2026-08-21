import 'dotenv/config';

const BASE = 'http://127.0.0.1:4000/api';

async function req(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

const username = process.env.ADMIN_USERNAME;
const password = process.env.ADMIN_PASSWORD;
const pin = process.env.ADMIN_PIN;

const login = await req('POST', '/auth/login', { identifier: username, password });
console.log('login:', login.status, login.json.requirePin ? 'PIN required' : login.json.error || '?');
if (!login.json.challenge) {
  console.error('No challenge token returned — aborting');
  process.exit(1);
}

const pinRes = await req('POST', '/auth/pin', { challenge: login.json.challenge, pin });
console.log('pin:', pinRes.status, pinRes.json.access ? 'OK' : pinRes.json.error || 'no token');
if (!pinRes.json.access) process.exit(1);
const token = pinRes.json.access;

const question = process.argv[2] || 'what are my employees names?';
console.log('\n--- QUESTION:', question, '---');
const chat = await req('POST', '/ai-chat', { messages: [{ role: 'user', content: question }] }, token);
console.log('ai-chat status:', chat.status);
const r = chat.json;
console.log('reply:', (r.reply || '').slice(0, 300));
console.log('model:', r.modelLabel, '| fallback:', r.fallback);
console.log('visuals:', JSON.stringify(r.visuals || null, null, 2));
