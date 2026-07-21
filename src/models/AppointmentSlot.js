const mongoose = require('mongoose');

const AppointmentSlotSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null, required: false },
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  title: { type: String, trim: true, default: 'Consultation Slot' },
  description: { type: String, trim: true, default: '' },
  slotDate: { type: String, required: true, trim: true },
  startTime: { type: String, required: true, trim: true },
  endTime: { type: String, required: true, trim: true },
  maxBookings: { type: Number, default: 1, min: 1 },
  bookedCount: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['open', 'full', 'closed', 'cancelled'], default: 'open' },
  consultationMode: { type: String, enum: ['in_person', 'video', 'phone'], default: 'in_person' },
  fee: { type: Number, default: 0, min: 0 }
}, { timestamps: true });

module.exports = mongoose.model('AppointmentSlot', AppointmentSlotSchema);
