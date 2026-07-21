// routes/authRoutes.js
const authController = require('../controllers/authController');

async function authRoutes(fastify, options) {
  // Step 1: Base Account Creation
  fastify.post('/auth/create-account', authController.createAccount);

  // Unified Login Endpoint (Patient, Doctor, Hospital, Clinic, Lab, Admin, Manager)
  fastify.post('/auth/login', authController.unifiedLogin);

  // Google Authentication & Onboarding
  fastify.post('/auth/google', authController.googleLogin);

  // Step 3: Complete Organization Profile
  fastify.post('/auth/complete-org-profile', {
    preHandler: [fastify.authenticate] // Ensures JWT is verified
  }, authController.completeOrgProfile);
}

module.exports = authRoutes;