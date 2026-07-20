// server.js
// Load environment variables immediately before anything else runs
require('dotenv').config();

const buildApp = require('./src/app');
const fastify = buildApp();

const start = async () => {
  try {
    const port = process.env.PORT || 3000;
    await fastify.listen({ port: Number(port), host: '127.0.0.1' });
    console.log(`Server running on http://127.0.0.1:${port}`);
  } catch (err) {
    console.error('Server startup error:', err);
    process.exit(1);
  }
};

start();