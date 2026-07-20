// routes/userRoutes.js
const userController = require('../controllers/userController');

async function userRoutes(fastify, options) {
  // Public Auth
  fastify.post('/user/login', userController.userLogin);

  // Authenticated User State (Supports both GET and POST for complete-profile to prevent 404s)
  fastify.get('/user/complete-profile', { preHandler: [fastify.authenticate] }, userController.getUserMe);
  fastify.post('/user/complete-profile', { preHandler: [fastify.authenticate] }, userController.completeUserProfile);
  fastify.get('/user/me', { preHandler: [fastify.authenticate] }, userController.getUserMe);

  // User Profile CRUD
  fastify.put('/user/profile/:targetUserId', { preHandler: [fastify.authenticate] }, userController.updateUserProfile);
  fastify.delete('/user/profile/:targetUserId', { preHandler: [fastify.authenticate] }, userController.deleteUserProfile);

  // Managed Profiles & Family Member Workflows
  fastify.get('/user/search', { preHandler: [fastify.authenticate] }, userController.searchUserByEmail);
  fastify.post('/user/managed-profiles/request', { preHandler: [fastify.authenticate] }, userController.sendManagedProfileRequest);
  fastify.patch('/user/managed-profiles/requests/:requestId', { preHandler: [fastify.authenticate] }, userController.respondManagedProfileRequest);
  fastify.post('/user/managed-profiles/create-sub-account', { preHandler: [fastify.authenticate] }, userController.createSubAccountPatient);
}

module.exports = userRoutes;
