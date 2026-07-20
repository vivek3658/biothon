const mongoose = require('mongoose');
const User = require('../models/User');
const MedicineReminder = require('../models/MedicineReminder');
const Prescription = require('../models/Prescription');

const resolveUser = async ({ accountId, entityId }) => {
  if (entityId && mongoose.Types.ObjectId.isValid(entityId)) {
    const user = await User.findById(entityId);
    if (user) return user;
  }
  if (accountId) return User.findOne({ accountId });
  return null;
};

exports.createReminder = async (request, reply) => {
  try {
    const patient = await resolveUser(request.user || {});
    if (!patient) return reply.code(403).send({ error: 'Patient identity required.' });

    const { prescriptionId, medicationName, beforeEating, mealSlot, baseMealTime } = request.body || {};
    if (!prescriptionId || !mongoose.Types.ObjectId.isValid(prescriptionId)) return reply.code(400).send({ error: 'Valid prescriptionId is required.' });
    if (!medicationName?.trim()) return reply.code(400).send({ error: 'medicationName is required.' });
    if (!['breakfast', 'lunch', 'dinner'].includes(mealSlot)) return reply.code(400).send({ error: 'mealSlot must be breakfast, lunch, or dinner.' });

    const prescription = await Prescription.findById(prescriptionId);
    if (!prescription) return reply.code(404).send({ error: 'Prescription not found.' });

    const [hourStr = '08', minuteStr = '00'] = (baseMealTime || '08:00').split(':');
    let totalMinutes = (parseInt(hourStr, 10) || 8) * 60 + (parseInt(minuteStr, 10) || 0);
    totalMinutes += beforeEating ? -20 : 20;
    if (totalMinutes < 0) totalMinutes = 0;
    const reminderHour = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
    const reminderMinute = String(totalMinutes % 60).padStart(2, '0');
    const reminderTime = `${reminderHour}:${reminderMinute}`;

    const reminder = await MedicineReminder.create({
      patientId: patient._id,
      prescriptionId,
      medicationName: medicationName.trim(),
      beforeEating: Boolean(beforeEating),
      mealSlot,
      reminderTime
    });

    return reply.code(201).send({ success: true, reminder });
  } catch (err) {
    return reply.code(500).send({ error: 'Failed to create reminder.', details: err.message });
  }
};

exports.getReminders = async (request, reply) => {
  try {
    const patient = await resolveUser(request.user || {});
    if (!patient && request.user?.role !== 'admin') return reply.code(403).send({ error: 'Patient identity required.' });

    const filter = patient ? { patientId: patient._id } : {};
    const reminders = await MedicineReminder.find(filter).sort({ createdAt: -1 }).lean();
    return reply.send({ success: true, reminders });
  } catch (err) {
    return reply.code(500).send({ error: 'Failed to fetch reminders.', details: err.message });
  }
};

exports.updateReminderStatus = async (request, reply) => {
  try {
    const { reminderId } = request.params || {};
    const { status } = request.body || {};
    if (!reminderId || !mongoose.Types.ObjectId.isValid(reminderId)) return reply.code(400).send({ error: 'Invalid reminderId.' });
    if (!['active', 'stopped'].includes(status)) return reply.code(400).send({ error: 'Invalid reminder status.' });

    const patient = await resolveUser(request.user || {});
    const reminder = await MedicineReminder.findById(reminderId);
    if (!reminder) return reply.code(404).send({ error: 'Reminder not found.' });
    if (patient && reminder.patientId.toString() !== patient._id.toString()) return reply.code(403).send({ error: 'You do not have permission to update this reminder.' });

    reminder.status = status;
    await reminder.save();
    return reply.send({ success: true, reminder });
  } catch (err) {
    return reply.code(500).send({ error: 'Failed to update reminder.', details: err.message });
  }
};

exports.deleteReminder = async (request, reply) => {
  try {
    const { reminderId } = request.params || {};
    if (!reminderId || !mongoose.Types.ObjectId.isValid(reminderId)) return reply.code(400).send({ error: 'Invalid reminderId.' });
    const patient = await resolveUser(request.user || {});
    const reminder = await MedicineReminder.findById(reminderId);
    if (!reminder) return reply.code(404).send({ error: 'Reminder not found.' });
    if (patient && reminder.patientId.toString() !== patient._id.toString()) return reply.code(403).send({ error: 'You do not have permission to delete this reminder.' });

    await MedicineReminder.findByIdAndDelete(reminderId);
    return reply.send({ success: true, message: 'Reminder deleted successfully.' });
  } catch (err) {
    return reply.code(500).send({ error: 'Failed to delete reminder.', details: err.message });
  }
};
