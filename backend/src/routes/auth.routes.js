import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { body, validationResult } from 'express-validator';
import prisma from '../lib/prisma.js';
import { env } from '../config/env.js';
import { auth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { logActivity } from '../lib/utils.js';
import { sendEmail, wrapHtml } from '../services/email.js';

const router = Router();

const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

// In-memory brute-force lockout tracker (per email + IP).
const attempts = new Map(); // key -> { count, lockedUntil }
const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;

function checkLock(key) {
  const rec = attempts.get(key);
  if (!rec) return false;
  if (rec.lockedUntil > Date.now()) return rec.lockedUntil;
  if (rec.lockedUntil > 0) attempts.delete(key); // clear only an *expired* lock
  return false;
}

function recordFailure(key) {
  const rec = attempts.get(key) || { count: 0, lockedUntil: 0 };
  rec.count += 1;
  if (rec.count >= MAX_ATTEMPTS) {
    rec.lockedUntil = Date.now() + LOCK_MS;
    rec.count = 0;
  }
  attempts.set(key, rec);
}

function clearAttempts(key) {
  attempts.delete(key);
}

function signTokens(user) {
  const jti = crypto.randomBytes(16).toString('hex');
  const access = jwt.sign({ sub: user.id, role: user.role, jti }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
  const refresh = jwt.sign({ sub: user.id, jti }, env.jwtRefreshSecret, { expiresIn: env.jwtRefreshExpiresIn });
  return { access, refresh };
}

async function createSession(userId, refresh, req) {
  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(refresh),
      ip: req.ip,
      userAgent: req.get('user-agent'),
      expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
    },
  });
}

router.post(
  '/register',
  authLimiter,
  [
    body('name').trim().isLength({ min: 2 }),
    body('email').isEmail(),
    body('password').isLength({ min: 6 }),
    body('role').optional().isIn(['ADMIN', 'WORKER']),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

      const { name, email, password, role = 'WORKER' } = req.body;
      if (role === 'ADMIN') {
        return res.status(403).json({ error: 'Admin accounts are provisioned by the system owner only' });
      }
      const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
      if (existing) return res.status(409).json({ error: 'Email already registered' });

      const passwordHash = await bcrypt.hash(password, 10);
      const user = await prisma.user.create({
        data: { name, email: email.toLowerCase(), passwordHash, role },
      });
      if (role === 'WORKER') {
        await prisma.worker.create({
          data: { userId: user.id, seniorityTier: 'MID', baseCapacity: 3, effectiveCapacity: 3 },
        });
      }
      const tokens = signTokens(user);
      await createSession(user.id, tokens.refresh, req);
      await logActivity(user.id, 'auth.register');
      res.status(201).json({
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
        ...tokens,
      });
    } catch (e) { next(e); }
  }
);

router.post(
  '/login',
  authLimiter,
  [
    body('identifier').optional().isString().notEmpty(),
    body('email').optional().isEmail(),
    body('password').notEmpty(),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid credentials format' });

      const identifier = String(req.body.identifier || req.body.email || '').trim();
      if (!identifier) return res.status(400).json({ error: 'Invalid credentials format' });

      const { password } = req.body;
      const idKey = `id:${identifier.toLowerCase()}`;
      const ipKey = `ip:${req.ip}`;

      const idLock = checkLock(idKey);
      const ipLock = checkLock(ipKey);
      if (idLock || ipLock) {
        const mins = Math.ceil(((idLock || ipLock) - Date.now()) / 60000);
        return res.status(429).json({ error: `Too many failed attempts. Account locked for ${mins} minute(s).` });
      }

      const user = await prisma.user.findFirst({
        where: { OR: [{ email: identifier.toLowerCase() }, { username: identifier }] },
      });
      if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
        recordFailure(idKey);
        recordFailure(ipKey);
        return res.status(401).json({ error: 'Invalid username or password' });
      }
      if (!user.active) return res.status(403).json({ error: 'Account deactivated' });

      clearAttempts(idKey);
      clearAttempts(ipKey);

      // Admins need a second factor: a 6-digit PIN. Never issue tokens at this stage.
      if (user.role === 'ADMIN') {
        const challenge = jwt.sign({ sub: user.id, pin: true }, env.jwtSecret, { expiresIn: '5m' });
        await logActivity(user.id, 'auth.login_pin_requested');
        return res.json({ requirePin: true, challenge });
      }

      const tokens = signTokens(user);
      await createSession(user.id, tokens.refresh, req);
      await logActivity(user.id, 'auth.login');

      const worker = user.role === 'WORKER' ? await prisma.worker.findUnique({ where: { userId: user.id } }) : null;
      res.json({
        user: {
          id: user.id, name: user.name, email: user.email, role: user.role, avatar: user.avatar,
          workerId: worker?.id || null,
        },
        ...tokens,
      });
    } catch (e) { next(e); }
  }
);

/** Second step of admin login: verify the 6-digit PIN and issue tokens. */
router.post(
  '/pin',
  authLimiter,
  [
    body('challenge').notEmpty(),
    body('pin').isLength({ min: 6, max: 6 }).isNumeric(),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ error: 'A 6-digit PIN is required' });

      const { challenge, pin } = req.body;

      let payload;
      try {
        payload = jwt.verify(challenge, env.jwtSecret);
      } catch {
        return res.status(400).json({ error: 'Login session expired. Please sign in again.' });
      }
      if (!payload.pin) return res.status(400).json({ error: 'Invalid login challenge' });

      const pinKey = `pin:${payload.sub}`;
      const pinIpKey = `pinip:${req.ip}`;
      const pinLock = checkLock(pinKey);
      const ipLock = checkLock(pinIpKey);
      if (pinLock || ipLock) {
        const mins = Math.ceil(((pinLock || ipLock) - Date.now()) / 60000);
        return res.status(429).json({ error: `Too many failed PIN attempts. Locked for ${mins} minute(s).` });
      }

      const user = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || !user.active) return res.status(401).json({ error: 'Account unavailable' });
      if (!user.pinHash || !(await bcrypt.compare(String(pin), user.pinHash))) {
        recordFailure(pinKey);
        recordFailure(pinIpKey);
        return res.status(401).json({ error: 'Incorrect PIN' });
      }

      clearAttempts(pinKey);
      clearAttempts(pinIpKey);

      const tokens = signTokens(user);
      await createSession(user.id, tokens.refresh, req);
      await logActivity(user.id, 'auth.login');

      const worker = user.role === 'WORKER' ? await prisma.worker.findUnique({ where: { userId: user.id } }) : null;
      res.json({
        user: {
          id: user.id, name: user.name, email: user.email, role: user.role, avatar: user.avatar,
          workerId: worker?.id || null,
        },
        ...tokens,
      });
    } catch (e) { next(e); }
  }
);

/** Request a password reset email. */
router.post('/forgot-password', authLimiter, async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = email ? await prisma.user.findUnique({ where: { email: String(email).toLowerCase() } }) : null;
    // Always return ok — don't leak which emails exist.
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      await prisma.session.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        },
      });
      const resetLink = `${env.frontendUrl}/reset-password?token=${token}`;
      await sendEmail(user.email, 'Reset your AgencyOps password', {
        html: wrapHtml('Password reset', `
          <p>Hi ${user.name},</p>
          <p>You requested a password reset. This link is valid for 30 minutes:</p>
          <p><a href="${resetLink}" style="background:#2563eb;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;">Reset password</a></p>
          <p style="color:#64748b;font-size:12px;">If you didn't request this, you can ignore this email.</p>`),
        text: `Reset your password: ${resetLink}`,
      });
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/** Complete the password reset. */
router.post('/reset-password', authLimiter, async (req, res, next) => {
  try {
    const { token, password } = req.body;
    if (!token || !password || password.length < 6) {
      return res.status(400).json({ error: 'A valid token and password (min 6 chars) are required' });
    }
    const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Reset link is invalid or expired' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.update({ where: { id: session.userId }, data: { passwordHash } });
    // Revoke the reset session + all other sessions for safety.
    await prisma.session.updateMany({ where: { userId: session.userId }, data: { revokedAt: new Date() } });
    await logActivity(session.userId, 'auth.password_reset');
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(401).json({ error: 'Refresh token required' });

    let payload;
    try {
      payload = jwt.verify(refreshToken, env.jwtRefreshSecret);
    } catch {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(refreshToken) } });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      return res.status(401).json({ error: 'Session revoked or expired' });
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.active) return res.status(401).json({ error: 'Account unavailable' });

    const tokens = signTokens(user);
    // rotate refresh token
    await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    await createSession(user.id, tokens.refresh, req);

    res.json({ ...tokens });
  } catch (e) { next(e); }
});

router.post('/logout', auth, async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await prisma.session.updateMany({
        where: { tokenHash: hashToken(refreshToken) },
        data: { revokedAt: new Date() },
      });
    }
    await logActivity(req.user.id, 'auth.logout');
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/revoke-session', auth, async (req, res, next) => {
  try {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Admins only' });
    const { sessionId } = req.body;
    await prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
    await logActivity(req.user.id, 'auth.revoke_session', 'session', sessionId);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
