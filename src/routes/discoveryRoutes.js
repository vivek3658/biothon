const { authenticate } = require('../middlewares/authMiddleware');
const discoveryController = require('../controllers/discoveryController');

async function discoveryRoutes(fastify) {
  fastify.get('/discovery/nearby-organizations', { preHandler: [authenticate] }, discoveryController.getNearbyOrganizations);
}

module.exports = discoveryRoutes;
