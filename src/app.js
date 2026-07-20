// app.js
const Fastify = require('fastify');
const dbConnector = require('./config/db');
const employeeAuthRoutes = require('./routes/employeeAuthRoutes');
const {  authenticate } = require('./middlewares/authMiddleware');

const buildApp = () => {
  const fastify = Fastify({ logger: true });
  // 1. Response Compression Middleware (Gzip/Brotli)
  fastify.register(require('@fastify/compress'), {
    global: true,
    threshold: 1024 // Only compress responses larger than 1KB
  });
  // 1. Register the JWT plugin first
  fastify.register(require('@fastify/jwt'), {
  secret: process.env.JWT_SECRET || 'fallback_secret_key',
  cookie: {
    cookieName: 'token',
    signed: false
  }
});
  // Register cookie engine before routes
  fastify.register(require('@fastify/cookie'), {
    secret: process.env.COOKIE_SECRET || 'a_secure_cookie_signing_key_32_chars',
    parseOptions: {} 
  });

  // 1. Register the database plugin
  fastify.register(dbConnector);
  fastify.decorate('authenticate', authenticate);
  fastify.register(employeeAuthRoutes); 
  fastify.register(require('./routes/adminRoutes'));
  fastify.register(require('./routes/authRoutes'));
  // Register after decorator definitions in app.js
fastify.register(require('./routes/managerRoutes'));

  fastify.register(require('./routes/organizationRoutes'));
  
  // 2. Simple routes
  fastify.get('/health', async (request, reply) => {
    return { status: 'ok' };
  });
  // fastify.register(require('./config/redis'));
  return fastify;
};

module.exports = buildApp;