// routes/adminRoutes.js
const adminController = require('../controllers/adminController');
const { isAdmin } = require('../middlewares/authMiddleware');

async function adminRoutes(fastify, options) {
  // Strict execution wall: apply protection hook to all operations inside this route group
  fastify.addHook('preHandler', isAdmin);

  fastify.post('/admin/managers', adminController.createManager);
  fastify.get('/admin/managers', adminController.getAllManagers);
  fastify.get('/admin/managers/:id', adminController.getManagerById);
  fastify.put('/admin/managers/:id', adminController.updateManager);
  fastify.delete('/admin/managers/:id', adminController.deleteManager);
}

module.exports = adminRoutes;