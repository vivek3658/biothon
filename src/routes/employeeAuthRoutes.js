// routes/employeeAuthRoutes.js

const employeeAuthController = require('../controllers/employeeAuthController');

async function employeeAuthRoutes(fastify, options) {
  
  // Single login path for Admin and Manager
  fastify.post('/employee-auth',employeeAuthController.login);

  fastify.get('/employee-auth/me',employeeAuthController.getMe);
  fastify.post('/employee-auth/logout',employeeAuthController.logout);
  
}

module.exports = employeeAuthRoutes;