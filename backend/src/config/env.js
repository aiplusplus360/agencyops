import 'dotenv/config';

export const env = {
  port: parseInt(process.env.PORT || '4000', 10),
  // Bind host. In production the app is fronted by nginx on the same box, so
  // it should only listen on loopback; local/LAN dev needs 0.0.0.0.
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET || 'dev-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  deepseekApiKey: process.env.DEEPSEEK_API_KEY || '',
  deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
  deepseekModel: process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
  deepseekProModel: process.env.DEEPSEEK_PRO_MODEL || 'deepseek-v4-pro',
  deepseekFlashModel: process.env.DEEPSEEK_FLASH_MODEL || 'deepseek-v4-flash',
  modelSelection: process.env.MODEL_SELECTION || 'auto', // auto | deepseek-v4-pro | deepseek-v4-flash
  businessHoursTimezone: process.env.BUSINESS_HOURS_TIMEZONE || 'UTC',
  webResearchEnabled: process.env.WEB_RESEARCH_ENABLED !== 'false',
  frontendUrl: (process.env.FRONTEND_URL || 'http://localhost:5173').split(',')[0].trim(),
  // CORS allows every origin listed (comma-separated) — e.g. localhost dev
  // plus the LAN IP for phone/tablet access. The express/socketio `cors`
  // packages both accept an array of allowed origins.
  corsOrigins: (process.env.FRONTEND_URL || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '465', 10),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || '',
    digestEmail: process.env.DIGEST_EMAIL || '',
  },
  imap: {
    host: process.env.IMAP_HOST || process.env.SMTP_HOST || '',
    port: parseInt(process.env.IMAP_PORT || '993', 10),
    user: process.env.IMAP_USER || process.env.SMTP_USER || '',
    pass: process.env.IMAP_PASS || process.env.SMTP_PASS || '',
  },
  ownerEmail: process.env.OWNER_EMAIL || process.env.DIGEST_EMAIL || '',
};
