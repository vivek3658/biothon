const managerController = require('../controllers/managerController');
const { verifyRole } = require('../middlewares/authMiddleware');

async function managerRoutes(fastify, options) {
  // Authorization boundary: accessible ONLY by manager or admin
  const requireManagerOrAdmin = {
    preHandler: [
      fastify.authenticate,
      verifyRole(['manager', 'admin'])
    ]
  };

  // Get list of applications awaiting review
  fastify.get(
    '/manager/organizations/pending', 
    requireManagerOrAdmin, 
    managerController.getPendingOrganizations
  );

  // Get list of all organizations (with optional status filter)
  fastify.get(
    '/manager/organizations',
    requireManagerOrAdmin,
    managerController.getAllOrganizations
  );

  // Approve or reject target organization
  fastify.patch(
    '/manager/organizations/:orgId/verify', 
    requireManagerOrAdmin, 
    managerController.verifyOrganization
  );

  // Manager Doctor Verifications
  fastify.get(
    '/manager/doctors/pending',
    requireManagerOrAdmin,
    managerController.getPendingDoctors
  );

  fastify.patch(
    '/manager/doctors/:doctorId/verify',
    requireManagerOrAdmin,
    managerController.verifyDoctor
  );
}

module.exports = managerRoutes;