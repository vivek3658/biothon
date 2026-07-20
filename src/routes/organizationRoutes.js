// routes/organizationRoutes.js
const authController = require('../controllers/authController');
const organizationController = require('../controllers/organizationController');
const { authenticate } = require('../middlewares/authMiddleware');

async function organizationRoutes(fastify, options) {
  // Public Auth
  fastify.post('/org/login', authController.organizationLogin);
  fastify.post('/org/logout', authController.logout);

  // Authenticated State
  fastify.get('/org/me', { preHandler: [authenticate] }, authController.getMe);

  // Doctor Affiliation Search & Organization Actions
  fastify.get('/org/search', { preHandler: [authenticate] }, organizationController.searchOrganizations);
  fastify.get('/org/pending-doctors', { preHandler: [authenticate] }, organizationController.getPendingDoctors);

  // Support both GET and POST for doctor approval to support direct links & fetch calls
  fastify.post('/org/approve-doctor/:doctorId', { preHandler: [authenticate] }, organizationController.approveDoctor);
  fastify.get('/org/approve-doctor/:doctorId', { preHandler: [authenticate] }, organizationController.approveDoctor);

  // Support both GET and POST for doctor rejection
  fastify.post('/org/reject-doctor/:doctorId', { preHandler: [authenticate] }, organizationController.rejectDoctor);
  fastify.get('/org/reject-doctor/:doctorId', { preHandler: [authenticate] }, organizationController.rejectDoctor);

  // Profile Operations (Self or Admin)
  fastify.put('/org/:targetOrgId', { preHandler: [authenticate] }, organizationController.updateOrgProfile);
  fastify.delete('/org/:targetOrgId', { preHandler: [authenticate] }, organizationController.deleteOrgAccount);
}

module.exports = organizationRoutes;