const mongoose = require('mongoose');

const AppointmentSchema = new mongoose.Schema({
  slotId: { type: mongoose.Schema.Types.ObjectId, ref: 'AppointmentSlot', required: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null },
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reason: { type: String, trim: true, default: '' },
  status: { 
    type: String, 
    enum: ['requested', 'appointed', 'checked_in', 'waiting', 'in_consultation', 'rejected', 'cancelled', 'completed'], 
    default: 'appointed' 
  },
  rejectionReason: { type: String, trim: true, default: '' },
  appointmentDate: { type: String, required: true, trim: true },
  appointmentTime: { type: String, required: true, trim: true },
  tokenNumber: { type: Number, default: 1 },
  qrCodeToken: { type: String, unique: true, sparse: true },
  checkInTime: { type: Date, default: null },
  consultationStartTime: { type: Date, default: null },
  consultationEndTime: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('Appointment', AppointmentSchema);
