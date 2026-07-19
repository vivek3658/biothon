// server.js
// Load environment variables immediately before anything else runs
require('dotenv').config();

const buildApp = require('./src/app');
const fastify = buildApp();

const start = async () => {
  try {
    await fastify.listen({ port: 3000 });
    console.log('Server running on http://localhost:3000');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();