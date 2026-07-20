// routes/userRoutes.js
const userController = require('../controllers/userController');
const { authenticate } = require('../middlewares/authMiddleware');

async function userRoutes(fastify, options) {
  // Public Auth
  fastify.post('/user/login', userController.userLogin);

  // Authenticated User State (Supports both GET and POST for complete-profile to prevent 404s)
  fastify.get('/user/complete-profile', { preHandler: [authenticate] }, userController.getUserMe);
  fastify.post('/user/complete-profile', { preHandler: [authenticate] }, userController.completeUserProfile);
  fastify.get('/user/me', { preHandler: [authenticate] }, userController.getUserMe);

  // Doctor Organization Affiliation Request
  fastify.post('/user/affiliate-request', { preHandler: [authenticate] }, userController.requestAffiliation);

  // User Profile CRUD
  fastify.get('/user/profile/:targetUserId', { preHandler: [authenticate] }, userController.getUserProfileById);
  fastify.put('/user/profile/:targetUserId', { preHandler: [authenticate] }, userController.updateUserProfile);
  fastify.delete('/user/profile/:targetUserId', { preHandler: [authenticate] }, userController.deleteUserProfile);

  // Managed Profiles & Family Member Workflows
  fastify.get('/user/search', { preHandler: [authenticate] }, userController.searchUserByEmail);
  fastify.post('/user/managed-profiles/request', { preHandler: [authenticate] }, userController.sendManagedProfileRequest);
  fastify.patch('/user/managed-profiles/requests/:requestId', { preHandler: [authenticate] }, userController.respondManagedProfileRequest);
  fastify.post('/user/managed-profiles/create-sub-account', { preHandler: [authenticate] }, userController.createSubAccountPatient);
}

module.exports = userRoutes;
