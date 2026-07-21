// routes/prescriptionRoutes.js
const prescriptionController = require('../controllers/prescriptionController');
const { authenticate } = require('../middlewares/authMiddleware');

async function prescriptionRoutes(fastify, options) {
  // Public Verification Gateway (No Auth Required)
  fastify.get('/prescription/verify/:token', prescriptionController.verifyQRToken);

  // Authenticated EMR Endpoints
  fastify.post('/prescription', { preHandler: [authenticate] }, prescriptionController.createPrescription);
  fastify.post('/prescriptions', { preHandler: [authenticate] }, prescriptionController.createPrescription);
  
  fastify.get('/prescription', { preHandler: [authenticate] }, prescriptionController.getPrescriptions);
  fastify.get('/prescriptions', { preHandler: [authenticate] }, prescriptionController.getPrescriptions);
  
  fastify.get('/prescription/:id', { preHandler: [authenticate] }, prescriptionController.getPrescriptionById);
  fastify.get('/prescriptions/:id', { preHandler: [authenticate] }, prescriptionController.getPrescriptionById);
  
  fastify.get('/prescription/:id/history', { preHandler: [authenticate] }, prescriptionController.getPrescriptionHistory);
  fastify.get('/prescriptions/:id/history', { preHandler: [authenticate] }, prescriptionController.getPrescriptionHistory);
  
  fastify.put('/prescription/:id', { preHandler: [authenticate] }, prescriptionController.updatePrescription);
  fastify.put('/prescriptions/:id', { preHandler: [authenticate] }, prescriptionController.updatePrescription);
  
  fastify.delete('/prescription/:id', { preHandler: [authenticate] }, prescriptionController.deletePrescription);
  fastify.delete('/prescriptions/:id', { preHandler: [authenticate] }, prescriptionController.deletePrescription);
}

module.exports = prescriptionRoutes;
