// app.js
const Fastify = require('fastify');
const dbConnector = require('./config/db');
const employeeAuthRoutes = require('./routes/employeeAuthRoutes');
const { authenticate } = require('./middlewares/authMiddleware');

// Ensure all Mongoose models are registered early
require('./models/Account');
require('./models/User');
require('./models/Organization');
require('./models/Medicine');
require('./models/Prescription');

const buildApp = () => {
  // Set pluginTimeout to 60s so slow DB connections don't trigger FST_ERR_PLUGIN_TIMEOUT
  const fastify = Fastify({ 
    logger: true,
    pluginTimeout: 60000 
  });

  // Add CORS headers hook for local frontend dev server
  fastify.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin;
    if (origin) {
      reply.header('Access-Control-Allow-Origin', origin);
      reply.header('Access-Control-Allow-Credentials', 'true');
      reply.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
      reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    }
    if (request.method === 'OPTIONS') {
      return reply.code(204).send();
    }
  });

  // 1. Response Compression Middleware (Gzip/Brotli)
  fastify.register(require('@fastify/compress'), {
    global: true,
    threshold: 1024
  });

  // 2. Register cookie engine BEFORE JWT so jwt plugin can sign/parse cookies
  fastify.register(require('@fastify/cookie'), {
    secret: process.env.COOKIE_SECRET || 'a_secure_cookie_signing_key_32_chars',
    parseOptions: {} 
  });

  // 3. Register the JWT plugin after cookie plugin
  fastify.register(require('@fastify/jwt'), {
    secret: process.env.JWT_SECRET || 'fallback_secret_key',
    cookie: {
      cookieName: 'token',
      signed: false
    }
  });

  // 4. Register the database plugin
  fastify.register(dbConnector);
  fastify.decorate('authenticate', authenticate);
  
  // 5. Register application routes
  fastify.register(employeeAuthRoutes); 
  fastify.register(require('./routes/adminRoutes'));
  fastify.register(require('./routes/medicineRoutes'));
  fastify.register(require('./routes/authRoutes'));
  fastify.register(require('./routes/managerRoutes'));
  fastify.register(require('./routes/organizationRoutes'));
  fastify.register(require('./routes/userRoutes'));
  fastify.register(require('./routes/prescriptionRoutes'));
  
  // Health check
  fastify.get('/health', async (request, reply) => {
    return { status: 'ok' };
  });

  return fastify;
};

module.exports = buildApp;