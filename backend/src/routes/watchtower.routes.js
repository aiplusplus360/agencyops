import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import { adminOnly } from '../middleware/roles.js';
import { runWatchtowerScan, checkWatchtowerEscalations, getWatchtowerStatus } from '../services/watchtower.js';

const router = Router();

/** Current watchtower config + last scan/alert state. */
router.get('/status', auth, adminOnly, async (req, res, next) => {
  try {
    res.json(await getWatchtowerStatus());
  } catch (e) { next(e); }
});

/** Manually trigger a scan now (useful after onboarding new work). */
router.post('/run', auth, adminOnly, async (req, res, next) => {
  try {
    const result = await runWatchtowerScan({ force: true });
    res.json(result);
  } catch (e) { next(e); }
});

/** Manually trigger the escalation email pass. */
router.post('/escalate', auth, adminOnly, async (req, res, next) => {
  try {
    const result = await checkWatchtowerEscalations();
    res.json(result);
  } catch (e) { next(e); }
});

export default router;
