// routes/medicineRoutes.js
const medicineController = require('../controllers/medicineController');
const { authenticate, isAdmin } = require('../middlewares/authMiddleware');

async function medicineRoutes(fastify, options) {
  // Public / Doctor / Authenticated Search APIs
  fastify.get('/medicine', { preHandler: [authenticate] }, medicineController.getAllMedicines);
  fastify.get('/medicines', { preHandler: [authenticate] }, medicineController.getAllMedicines);
  fastify.get('/medicine/search', { preHandler: [authenticate] }, medicineController.searchMedicines);
  fastify.get('/medicines/search', { preHandler: [authenticate] }, medicineController.searchMedicines);
  fastify.get('/medicine/:id', { preHandler: [authenticate] }, medicineController.getMedicineById);
  fastify.get('/medicines/:id', { preHandler: [authenticate] }, medicineController.getMedicineById);

  // Admin Catalog Management CRUD APIs
  fastify.post('/medicine', { preHandler: [isAdmin] }, medicineController.createMedicine);
  fastify.put('/medicine/:id', { preHandler: [isAdmin] }, medicineController.updateMedicine);
  fastify.delete('/medicine/:id', { preHandler: [isAdmin] }, medicineController.deleteMedicine);

  // Legacy & Alias Admin endpoints
  fastify.post('/admin/medicines/seed', { preHandler: [isAdmin] }, medicineController.seedMedicines);
  fastify.post('/admin/medicines', { preHandler: [isAdmin] }, medicineController.createMedicine);
  fastify.get('/admin/medicines', { preHandler: [isAdmin] }, medicineController.getAllMedicines);
  fastify.put('/admin/medicines/:id', { preHandler: [isAdmin] }, medicineController.updateMedicine);
  fastify.delete('/admin/medicines/:id', { preHandler: [isAdmin] }, medicineController.deleteMedicine);
}

module.exports = medicineRoutes;
