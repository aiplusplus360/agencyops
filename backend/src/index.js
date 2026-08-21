import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { notFound, errorHandler } from './middleware/error.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { startCron } from './jobs/cron.js';

// ============ Process-level crash safety ============
// Node's default behavior on an unhandled promise rejection is to kill the
// process silently. That is exactly what took the backend down mid-chat and
// produced "Failed to fetch" on the frontend with no trace in the logs.
// Log the error and keep serving instead.
process.on('unhandledRejection', (reason) => {
  logger.error('[process] UNHANDLED PROMISE REJECTION:', reason instanceof Error ? reason.stack || reason : reason);
});
process.on('uncaughtException', (err) => {
  logger.error('[process] UNCAUGHT EXCEPTION:', err?.stack || err);
});

import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/users.routes.js';
import workerRoutes from './routes/workers.routes.js';
import skillRoutes from './routes/skills.routes.js';
import productRoutes from './routes/products.routes.js';
import visionRoutes from './routes/visions.routes.js';
import roadmapRoutes from './routes/roadmaps.routes.js';
import taskRoutes from './routes/tasks.routes.js';
import assignmentRoutes from './routes/assignments.routes.js';
import submissionRoutes from './routes/submissions.routes.js';
import evaluationRoutes from './routes/evaluations.routes.js';
import notificationRoutes from './routes/notifications.routes.js';
import leaderboardRoutes from './routes/leaderboard.routes.js';
import utilizationRoutes from './routes/utilization.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import availabilityRoutes from './routes/availability.routes.js';
import appealRoutes from './routes/appeals.routes.js';
import briefFeedbackRoutes from './routes/briefFeedback.routes.js';
import searchRoutes from './routes/search.routes.js';
import aiDecisionRoutes from './routes/aiDecisions.routes.js';
import usageRoutes from './routes/usage.routes.js';
import templateRoutes from './routes/templates.routes.js';
import digestRoutes from './routes/digests.routes.js';
import exportRoutes from './routes/export.routes.js';
import aiChatRoutes from './routes/aiChat.routes.js';
import emailRoutes from './routes/emails.routes.js';
import memoryRoutes from './routes/memory.routes.js';
import conversationRoutes from './routes/conversations.routes.js';
import watchtowerRoutes from './routes/watchtower.routes.js';
import healthRoutes from './routes/health.routes.js';
import { setIo } from './services/realtime.js';

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: env.corsOrigins, methods: ['GET', 'POST'] },
});

app.use(cors({ origin: env.corsOrigins, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(apiLimiter);

// Lightweight request logging so backend activity is visible in the terminal
// (which request arrived, when it completed, and how long it took).
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info(`[http] ${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - start}ms)`);
  });
  next();
});

app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/workers', workerRoutes);
app.use('/api/skills', skillRoutes);
app.use('/api/products', productRoutes);
app.use('/api/visions', visionRoutes);
app.use('/api/roadmaps', roadmapRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/submissions', submissionRoutes);
app.use('/api/evaluations', evaluationRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/utilization', utilizationRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/availability', availabilityRoutes);
app.use('/api/appeals', appealRoutes);
app.use('/api/brief-feedback', briefFeedbackRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/ai-decisions', aiDecisionRoutes);
app.use('/api/usage', usageRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/digests', digestRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/ai-chat', aiChatRoutes);
app.use('/api/emails', emailRoutes);
app.use('/api/memories', memoryRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/watchtower', watchtowerRoutes);

app.use(notFound);
app.use(errorHandler);

// ============ Socket.IO real-time ============
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('auth required'));
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    socket.userId = payload.sub;
    socket.role = payload.role;
    next();
  } catch {
    next(new Error('invalid token'));
  }
});

io.on('connection', (socket) => {
  logger.info(`[socket] connected: user ${socket.userId} (${socket.role})`);
  socket.join(`user:${socket.userId}`);
  if (socket.role === 'ADMIN') socket.join('admins');
  socket.on('disconnect', () => logger.info(`[socket] disconnected: ${socket.userId}`));
});

setIo(io);

server.listen(env.port, () => {
  logger.info(`AgencyOps backend listening on http://localhost:${env.port}`);
  startCron();
});

// Safety net: close sockets that sit idle too long (e.g. an AI call that
// hangs upstream) so requests can never wedge the server forever.
server.requestTimeout = 10 * 60 * 1000;
server.keepAliveTimeout = 65 * 1000;
server.headersTimeout = 70 * 1000;

// ============ Event-loop watchdog ============
// The backend has intermittently gone unresponsive while the process still
// held the port (health checks time out, ~100% CPU). That signature means a
// synchronous block on the event loop. This watchdog runs in a WORKER THREAD
// so it can detect even a permanent block (an in-process timer can't fire
// while the loop is stuck), logs to logs/watchdog.log (survives terminal
// loss), and force-exits the process so the supervisor restarts it.
import { startWatchdog } from './watchdog.js';
startWatchdog();

