const { authenticate } = require('../middlewares/authMiddleware');
const appointmentController = require('../controllers/appointmentController');

async function appointmentRoutes(fastify) {
  fastify.post('/appointments/slots', { preHandler: [authenticate] }, appointmentController.createSlot);
  fastify.post('/appointments/slots/generate', { preHandler: [authenticate] }, appointmentController.generateSlots);
  fastify.get('/appointments/slots', { preHandler: [authenticate] }, appointmentController.getSlots);
  fastify.post('/appointments/book', { preHandler: [authenticate] }, appointmentController.bookAppointment);
  fastify.post('/appointments/check-in', { preHandler: [authenticate] }, appointmentController.checkInAppointment);
  fastify.get('/appointments/queue', { preHandler: [authenticate] }, appointmentController.getLiveQueue);
  fastify.post('/appointments', { preHandler: [authenticate] }, appointmentController.bookAppointment);
  fastify.get('/appointments', { preHandler: [authenticate] }, appointmentController.getAppointments);
  fastify.patch('/appointments/:appointmentId/status', { preHandler: [authenticate] }, appointmentController.updateAppointmentStatus);
}

module.exports = appointmentRoutes;
