import 'dotenv/config';

const BASE = process.env.VPS_BASE || 'https://task.theaiplusplus.com/api';

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

const username = process.env.VPS_ADMIN_USERNAME || process.env.ADMIN_USERNAME;
const password = process.env.VPS_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD;
const pin = process.env.VPS_ADMIN_PIN || process.env.ADMIN_PIN;

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

console.log('\n=== 1. GET /ai-chat/welcome ===');
const welcome = await req('GET', '/ai-chat/welcome', null, token);
console.log('status:', welcome.status);
console.log('questions:', JSON.stringify(welcome.json.questions, null, 2));

console.log('\n=== 2. Plan with missing detail — expect questions ===');
const chat1 = await req('POST', '/ai-chat', { messages: [{ role: 'user', content: 'Plan a launch campaign for our new client Aurora Skincare' }] }, token);
console.log('status:', chat1.status, '| fallback:', chat1.json.fallback);
console.log('reply:', (chat1.json.reply || '').slice(0, 200));
console.log('questions:', JSON.stringify(chat1.json.questions || null));

console.log('\n=== 3. Routine Q&A — expect no questions ===');
const chat2 = await req('POST', '/ai-chat', { messages: [{ role: 'user', content: 'what is the difference between marketing and branding?' }] }, token);
console.log('status:', chat2.status, '| fallback:', chat2.json.fallback);
console.log('reply:', (chat2.json.reply || '').slice(0, 200));
console.log('questions:', JSON.stringify(chat2.json.questions || null));
