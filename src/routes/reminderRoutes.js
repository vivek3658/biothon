const { authenticate } = require('../middlewares/authMiddleware');
const reminderController = require('../controllers/reminderController');

async function reminderRoutes(fastify) {
  fastify.post('/reminders', { preHandler: [authenticate] }, reminderController.createReminder);
  fastify.get('/reminders', { preHandler: [authenticate] }, reminderController.getReminders);
  fastify.patch('/reminders/:reminderId/status', { preHandler: [authenticate] }, reminderController.updateReminderStatus);
  fastify.delete('/reminders/:reminderId', { preHandler: [authenticate] }, reminderController.deleteReminder);
}

module.exports = reminderRoutes;
