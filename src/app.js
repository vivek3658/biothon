// app.js
const Fastify = require('fastify');
const dbConnector = require('./config/db');

const buildApp = () => {
  const fastify = Fastify({ logger: true });

  // 1. Register the database plugin
  fastify.register(dbConnector);

  // 2. Simple routes
  fastify.get('/health', async (request, reply) => {
    return { status: 'ok' };
  });

  return fastify;
};

module.exports = buildApp;