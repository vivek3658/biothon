const { buildApp } = require('../src/app');

let app;

module.exports = async (req, res) => {
  if (!app) {
    app = buildApp();
    await app.ready();
  }
  app.server.emit('request', req, res);
};
