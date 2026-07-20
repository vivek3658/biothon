const mongoose = require('mongoose');

const AppointmentSchema = new mongoose.Schema({
  slotId: { type: mongoose.Schema.Types.ObjectId, ref: 'AppointmentSlot', required: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reason: { type: String, trim: true, default: '' },
  status: { type: String, enum: ['requested', 'appointed', 'rejected', 'cancelled', 'completed'], default: 'requested' },
  rejectionReason: { type: String, trim: true, default: '' },
  appointmentDate: { type: String, required: true, trim: true },
  appointmentTime: { type: String, required: true, trim: true }
}, { timestamps: true });

module.exports = mongoose.model('Appointment', AppointmentSchema);
