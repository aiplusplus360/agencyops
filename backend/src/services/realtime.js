import { logger } from '../lib/logger.js';

let io = null;

export function setIo(instance) {
  io = instance;
}

export function getIo() {
  return io;
}

export function isConnected() {
  return !!io;
}

/** Emit to a specific user's private room. */
export function emitToUser(userId, event, payload) {
  if (!io || !userId) return;
  io.to(`user:${userId}`).emit(event, payload);
}

/** Emit to the admin team room. */
export function emitToAdmins(event, payload) {
  if (!io) return;
  io.to('admins').emit(event, payload);
}

/** Broadcast to everyone (rarely used). */
export function emitAll(event, payload) {
  if (!io) return;
  io.emit(event, payload);
}

export function logSocketInfo(msg) {
  logger.info(`[socket] ${msg}`);
}
