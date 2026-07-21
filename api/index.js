const { buildApp } = require('../src/app');

let app;

module.exports = async (req, res) => {
  const origin = req.headers.origin || 'https://arogyax-client.vercel.app';

  // Set explicit CORS headers directly on Vercel Serverless Response object
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-CSRF-Token');

  // Fast response for browser CORS preflight OPTIONS requests
  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end('OK');
    return;
  }

  try {
    if (!app) {
      app = buildApp();
      await app.ready();
    }
    app.server.emit('request', req, res);
  } catch (err) {
    console.error('Vercel Serverless Function Error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Server initialization error', details: err.message }));
  }
};
