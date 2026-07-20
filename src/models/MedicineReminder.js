const mongoose = require('mongoose');

const MedicineReminderSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  prescriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Prescription', required: true },
  medicationName: { type: String, required: true, trim: true },
  beforeEating: { type: Boolean, default: false },
  mealSlot: { type: String, enum: ['breakfast', 'lunch', 'dinner'], required: true },
  reminderTime: { type: String, required: true, trim: true },
  status: { type: String, enum: ['active', 'stopped'], default: 'active' }
}, { timestamps: true });

module.exports = mongoose.model('MedicineReminder', MedicineReminderSchema);
