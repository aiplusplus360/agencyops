import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env');

// Load current .env file (manual, so we can persist new vars).
let envContent = '';
if (fs.existsSync(envPath)) envContent = fs.readFileSync(envPath, 'utf8');

const getVar = (key) => {
  const m = envContent.match(new RegExp(`^${key}=(.*)$`, 'm'));
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
};

const setVar = (key, value) => {
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(envContent)) envContent = envContent.replace(re, `${key}=${value}`);
  else envContent += `\n${key}=${value}`;
};

// Use existing values if present; otherwise generate strong random ones.
const randFrom = (len, chars) => {
  let out = '';
  const bytes = crypto.randomBytes(len);
  for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length];
  return out;
};

const ALPHA_NUM = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ALPHA_NUM_SYM = ALPHA_NUM + '!@#$%^&*';

const username = getVar('ADMIN_USERNAME') || `ops-${randFrom(8, ALPHA_NUM)}`;
const password = getVar('ADMIN_PASSWORD') || randFrom(16, ALPHA_NUM_SYM);
const pin = getVar('ADMIN_PIN') || randFrom(6, '0123456789');

setVar('ADMIN_USERNAME', username);
setVar('ADMIN_PASSWORD', password);
setVar('ADMIN_PIN', pin);
fs.writeFileSync(envPath, envContent);

// Make DATABASE_URL available to Prisma.
const dbUrl = getVar('DATABASE_URL');
if (dbUrl) process.env.DATABASE_URL = dbUrl;

const passwordHash = await bcrypt.hash(password, 10);
const pinHash = await bcrypt.hash(pin, 10);

const prisma = new PrismaClient();
try {
  const admin = await prisma.user.upsert({
    where: { email: 'admin@coo.app' },
    update: { username, passwordHash, pinHash, role: 'ADMIN', active: true },
    create: {
      name: 'Agency Owner',
      email: 'admin@coo.app',
      username,
      passwordHash,
      pinHash,
      role: 'ADMIN',
    },
  });

  console.log('\nAdmin account secured.');
  console.log('----------------------------------------');
  console.log(`  Admin portal : /90ui66p`);
  console.log(`  Username     : ${username}`);
  console.log(`  Password     : ${password}`);
  console.log(`  6-digit PIN  : ${pin}`);
  console.log('----------------------------------------');
  console.log('Credentials saved to backend/.env (ADMIN_USERNAME / ADMIN_PASSWORD / ADMIN_PIN).');
  console.log('Do not share them. Change them anytime by editing .env and re-running:');
  console.log('  node scripts/setup-admin.mjs');
  void admin;
} finally {
  await prisma.$disconnect();
}
