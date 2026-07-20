// routes/prescriptionRoutes.js
const prescriptionController = require('../controllers/prescriptionController');
const { authenticate } = require('../middlewares/authMiddleware');

async function prescriptionRoutes(fastify, options) {
  fastify.post('/prescriptions', { preHandler: [authenticate] }, prescriptionController.createPrescription);
  fastify.get('/prescriptions', { preHandler: [authenticate] }, prescriptionController.getPrescriptions);
  fastify.get('/prescriptions/:id', { preHandler: [authenticate] }, prescriptionController.getPrescriptionById);
  fastify.put('/prescriptions/:id', { preHandler: [authenticate] }, prescriptionController.updatePrescription);
  fastify.delete('/prescriptions/:id', { preHandler: [authenticate] }, prescriptionController.deletePrescription);
}

module.exports = prescriptionRoutes;
