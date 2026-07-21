// routes/medicineRoutes.js
const medicineController = require('../controllers/medicineController');
const { authenticate, isAdmin } = require('../middlewares/authMiddleware');

async function medicineRoutes(fastify, options) {
  // 1. General search endpoints for all authenticated users (Doctors, Patients, Admins, Managers)
  fastify.get('/medicines', { preHandler: [authenticate] }, medicineController.getAllMedicines);
  fastify.get('/medicines/:id', { preHandler: [authenticate] }, medicineController.getMedicineById);

  // 2. Strict Admin-only CRUD & Seeding operations
  fastify.post('/admin/medicines/seed', { preHandler: [isAdmin] }, medicineController.seedMedicines);
  fastify.get('/admin/medicines/seed', { preHandler: [isAdmin] }, medicineController.seedMedicines);
  fastify.post('/admin/medicines', { preHandler: [isAdmin] }, medicineController.createMedicine);
  fastify.get('/admin/medicines', { preHandler: [isAdmin] }, medicineController.getAllMedicines);
  fastify.get('/admin/medicines/:id', { preHandler: [isAdmin] }, medicineController.getMedicineById);
  fastify.put('/admin/medicines/:id', { preHandler: [isAdmin] }, medicineController.updateMedicine);
  fastify.delete('/admin/medicines/:id', { preHandler: [isAdmin] }, medicineController.deleteMedicine);
}

module.exports = medicineRoutes;
