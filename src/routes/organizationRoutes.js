// routes/organizationRoutes.js
const authController = require('../controllers/authController');
const organizationController = require('../controllers/organizationController');


async function organizationRoutes(fastify, options) {
  // Public Auth
  fastify.post('/org/login', authController.organizationLogin);
  fastify.post('/org/logout', authController.logout);

  // Authenticated State
  fastify.get('/org/me', { preHandler: [fastify.authenticate] }, authController.getMe);

  // Profile Operations (Self or Admin)
  fastify.put('/org/:targetOrgId', { preHandler: [fastify.authenticate] }, organizationController.updateOrgProfile);
  fastify.delete('/org/:targetOrgId', { preHandler: [fastify.authenticate] }, organizationController.deleteOrgAccount);
}

module.exports = organizationRoutes;