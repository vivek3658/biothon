const { authenticate } = require('../middlewares/authMiddleware');
const pharmacyController = require('../controllers/pharmacyController');

async function pharmacyRoutes(fastify) {
  fastify.post('/pharmacy/inventory', { preHandler: [authenticate] }, pharmacyController.upsertInventoryItem);
  fastify.get('/pharmacy/inventory', { preHandler: [authenticate] }, pharmacyController.getInventory);
  fastify.get('/pharmacy/marketplace/:prescriptionId', { preHandler: [authenticate] }, pharmacyController.getMarketplaceForPrescription);
  fastify.post('/pharmacy/orders', { preHandler: [authenticate] }, pharmacyController.placeOrder);
  fastify.get('/pharmacy/orders', { preHandler: [authenticate] }, pharmacyController.getOrders);
  fastify.patch('/pharmacy/orders/:orderId/status', { preHandler: [authenticate] }, pharmacyController.updateOrderStatus);
}

module.exports = pharmacyRoutes;
