// routes/adminRoutes.js
const adminController = require('../controllers/adminController');
const { isAdmin } = require('../middlewares/authMiddleware');

async function adminRoutes(fastify, options) {
  // Strict Admin wall for manager management
  fastify.post('/admin/managers', { preHandler: [isAdmin] }, adminController.createManager);
  fastify.get('/admin/managers', { preHandler: [isAdmin] }, adminController.getAllManagers);
  fastify.get('/admin/managers/:id', { preHandler: [isAdmin] }, adminController.getManagerById);
  fastify.put('/admin/managers/:id', { preHandler: [isAdmin] }, adminController.updateManager);
  fastify.delete('/admin/managers/:id', { preHandler: [isAdmin] }, adminController.deleteManager);

  fastify.post('/admin/seed-all', adminController.seedAllRecords);
  fastify.get('/admin/seed-all', adminController.seedAllRecords);
}

module.exports = adminRoutes;