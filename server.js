require('dotenv').config();

const buildApp = require('./src/app');
const fastify = buildApp();

const start = async () => {
  try {
    const port = process.env.PORT || 3000;
    await fastify.listen({
      port: Number(port),
      host: process.env.HOST || '0.0.0.0'
    });
    console.log(`Server running on port ${port}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

start();
