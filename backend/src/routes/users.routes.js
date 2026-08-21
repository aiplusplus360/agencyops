import { Router } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma.js';
import { auth } from '../middleware/auth.js';
import { adminOnly } from '../middleware/roles.js';
import { logActivity, getEmployeeManagementPolicy } from '../lib/utils.js';
import { saveMemories } from '../services/ai/memory.js';

const router = Router();

router.get('/me', auth, async (req, res) => {
  const worker = req.user.role === 'WORKER'
    ? await prisma.worker.findUnique({
        where: { userId: req.user.id },
        include: { skills: { include: { skill: true } } },
      })
    : null;
  res.json({
    id: req.user.id,
    name: req.user.name,
    email: req.user.email,
    role: req.user.role,
    avatar: req.user.avatar,
    emailNotifs: req.user.emailNotifs,
    workerId: worker?.id || null,
    worker: worker
      ? {
          seniorityTier: worker.seniorityTier,
          baseCapacity: worker.baseCapacity,
          effectiveCapacity: worker.effectiveCapacity,
          availability: worker.availability,
          availabilityUntil: worker.availabilityUntil,
          strengthsNotes: worker.strengthsNotes,
          location: worker.location,
          lat: worker.lat,
          lng: worker.lng,
          skills: worker.skills.map((s) => ({ id: s.skillId, name: s.skill.name, proficiency: s.proficiency })),
        }
      : null,
  });
});

router.patch('/me', auth, async (req, res, next) => {
  try {
    const { name, avatar, emailNotifs, password, currentPassword, email, skills, strengthsNotes } = req.body;
    const data = {};
    if (name) data.name = name;
    if (avatar !== undefined) data.avatar = avatar;
    if (emailNotifs !== undefined) data.emailNotifs = emailNotifs;

    // Changing the login email requires re-entering the current password.
    if (email && String(email).trim().toLowerCase() !== req.user.email) {
      if (!currentPassword || !(await bcrypt.compare(currentPassword, req.user.passwordHash))) {
        return res.status(400).json({ error: 'Current password is required to change your login email' });
      }
      const emailLower = String(email).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLower)) {
        return res.status(400).json({ error: 'Enter a valid email address' });
      }
      const taken = await prisma.user.findUnique({ where: { email: emailLower } });
      if (taken && taken.id !== req.user.id) {
        return res.status(409).json({ error: `An account with ${emailLower} already exists.` });
      }
      data.email = emailLower;
    }

    if (password) {
      if (!currentPassword || !(await bcrypt.compare(currentPassword, req.user.passwordHash))) {
        return res.status(400).json({ error: 'Current password is required to change password' });
      }
      data.passwordHash = await bcrypt.hash(password, 10);
      // revoke all sessions on password change
      await prisma.session.updateMany({ where: { userId: req.user.id }, data: { revokedAt: new Date() } });
    }

    // Self-service work profile: a worker may edit their OWN skills and strengths notes.
    // These stay on their own record only — nothing here can touch other users or the admin.
    if (req.user.role === 'WORKER' && (Array.isArray(skills) || strengthsNotes !== undefined)) {
      const worker = await prisma.worker.findUnique({ where: { userId: req.user.id } });
      if (worker) {
        const workerData = {};
        if (strengthsNotes !== undefined) workerData.strengthsNotes = String(strengthsNotes).slice(0, 2000);
        if (Array.isArray(skills)) {
          const names = [...new Set(skills.map((s) => String(s).trim()).filter(Boolean))].slice(0, 20);
          const skillRows = await Promise.all(
            names.map((n) => prisma.skill.upsert({ where: { name: n }, update: {}, create: { name: n } }))
          );
          workerData.skills = { deleteMany: {}, create: skillRows.map((s) => ({ skillId: s.id, proficiency: 3 })) };
        }
        await prisma.worker.update({ where: { id: worker.id }, data: workerData });
      }
    }

    const user = await prisma.user.update({ where: { id: req.user.id }, data });
    await logActivity(req.user.id, 'user.update_profile');
    res.json({ id: user.id, name: user.name, email: user.email, role: user.role, avatar: user.avatar });
  } catch (e) { next(e); }
});

router.get('/', auth, adminOnly, async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, active: true, avatar: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(users);
  } catch (e) { next(e); }
});

/** Create a single worker account (User + Worker + skills) atomically. Throws on invalid input / duplicate email. */
async function createWorker({ name, email, password, seniorityTier = 'MID', baseCapacity = 3, strengthsNotes, skills = [], location, lat, lng }) {
  if (!name || !String(name).trim()) throw new Error('Employee name is required');
  if (!email || !String(email).trim()) throw new Error('Employee email is required');

  const emailLower = String(email).trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: emailLower } });
  if (existing) {
    const err = new Error(`An account with ${emailLower} already exists.`);
    err.status = 409;
    err.duplicateId = existing.id;
    throw err;
  }

  const finalPassword = password && String(password).trim() ? String(password).trim() : 'welcome123';
  const passwordHash = await bcrypt.hash(finalPassword, 10);

  const tier = ['JUNIOR', 'MID', 'SENIOR', 'LEAD'].includes(seniorityTier) ? seniorityTier : 'MID';
  const cap = Number(baseCapacity) >= 1 && Number(baseCapacity) <= 10 ? Number(baseCapacity) : 3;
  const latNum = Number(lat);
  const lngNum = Number(lng);
  const validLat = Number.isFinite(latNum) && latNum >= -90 && latNum <= 90;
  const validLng = Number.isFinite(lngNum) && lngNum >= -180 && lngNum <= 180;

  // Ensure the named skills exist in the registry, then attach them.
  const skillRows = await Promise.all(
    (Array.isArray(skills) ? skills : [])
      .map((s) => String(s).trim())
      .filter(Boolean)
      .map((skillName) =>
        prisma.skill.upsert({ where: { name: skillName }, update: {}, create: { name: skillName } })
      )
  );

  const user = await prisma.user.create({
    data: {
      name: String(name).trim(),
      email: emailLower,
      passwordHash,
      role: 'WORKER',
      worker: {
        create: {
          seniorityTier: tier,
          baseCapacity: cap,
          effectiveCapacity: cap,
          strengthsNotes: strengthsNotes || undefined,
          location: location ? String(location).slice(0, 120) : undefined,
          lat: validLat ? latNum : undefined,
          lng: validLng ? lngNum : undefined,
          skills: { create: skillRows.map((s) => ({ skillId: s.id, proficiency: 3 })) },
        },
      },
    },
    include: { worker: true },
  });

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    workerId: user.worker.id,
    password: finalPassword,
  };
}

/** Create a worker account (User + Worker + skills) in one atomic operation. */
router.post('/', auth, adminOnly, async (req, res, next) => {
  try {
    const policy = await getEmployeeManagementPolicy();
    if (!policy.createEnabled) {
      return res.status(403).json({ error: 'Employee creation is currently disabled in Settings → Employee Management.' });
    }
    const worker = await createWorker(req.body);
    await logActivity(req.user.id, 'user.create_worker', 'user', worker.id);
    res.status(201).json(worker);
  } catch (e) { next(e); }
});

/**
 * Bulk-create multiple worker accounts in one call (used by the AI Assistant
 * when the owner says "make their logins" for several people at once).
 * Each item is created independently so one duplicate never blocks the rest.
 */
router.post('/bulk', auth, adminOnly, async (req, res, next) => {
  try {
    const policy = await getEmployeeManagementPolicy();
    if (!policy.createEnabled) {
      return res.status(403).json({ error: 'Employee creation is currently disabled in Settings → Employee Management.' });
    }
    const { employees = [] } = req.body;
    if (!Array.isArray(employees) || !employees.length) {
      return res.status(400).json({ error: 'employees must be a non-empty array' });
    }
    const created = [];
    const errors = [];
    for (const emp of employees) {
      try {
        const worker = await createWorker(emp);
        created.push(worker);
      } catch (e) {
        errors.push({ name: emp?.name || '?', email: emp?.email || '', error: e.message });
      }
    }
    const anyCreated = created.length > 0;
    if (anyCreated) {
      await logActivity(req.user.id, 'user.bulk_create_workers', 'user', created.map((c) => c.id).join(','));
      // Remember the team so future chats know who is onboarded (best effort).
      saveMemories(
        req.user.id,
        created.map((c) => ({
          type: 'FACT',
          content: `Team member: ${c.name} (${c.email})`,
          category: 'team',
        })),
        'user_create'
      ).catch(() => {});
    }
    res.status(anyCreated ? 201 : 200).json({ created, errors });
  } catch (e) { next(e); }
});

router.patch('/:id', auth, adminOnly, async (req, res, next) => {
  try {
    const policy = await getEmployeeManagementPolicy();
    if (!policy.editEnabled) {
      return res.status(403).json({ error: 'Employee editing is currently disabled in Settings → Employee Management.' });
    }
    const { active, role, name, location, lat, lng } = req.body;
    const data = {};
    if (active !== undefined) data.active = active;
    if (role) data.role = role;
    if (name) data.name = name;
    const user = await prisma.user.update({ where: { id: req.params.id }, data });
    const workerData = {};
    if (location !== undefined) workerData.location = String(location).slice(0, 120);
    const latNum = Number(lat);
    const lngNum = Number(lng);
    if (Number.isFinite(latNum) && latNum >= -90 && latNum <= 90) workerData.lat = latNum;
    if (Number.isFinite(lngNum) && lngNum >= -180 && lngNum <= 180) workerData.lng = lngNum;
    if (Object.keys(workerData).length) {
      await prisma.worker.update({ where: { userId: req.params.id }, data: workerData });
    }
    await logActivity(req.user.id, 'user.update', 'user', user.id);
    res.json(user);
  } catch (e) { next(e); }
});

export default router;
