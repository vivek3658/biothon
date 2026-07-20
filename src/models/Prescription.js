// models/Prescription.js
const mongoose = require('mongoose');

const MedicationSchema = new mongoose.Schema({
  medicineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', default: null },
  medicineName: { type: String, required: true, trim: true },
  type: { type: String, default: 'oral_tablet' },
  dosage: { type: String, required: true, default: '500' },
  unit: { type: String, default: 'mg' },
  instructions: { type: String, default: '' },
  beforeEating: { type: Boolean, default: false },
  timesADay: { type: String, default: '2' }, // '1', '2', '3', 'custom'
  quantity: { type: String, default: '1' }, // 'half pill', '1', '2', 'custom'
  howManyDays: { type: String, default: '5 days' },
  notes: { type: String, default: '' },
  price: { type: Number, default: 0 }
}, { _id: true });

const ReportAttachmentSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  fileUrl: { type: String, required: true, trim: true },
  labName: { type: String, trim: true, default: '' },
  reportDate: { type: String, trim: true, default: () => new Date().toISOString().split('T')[0] }
}, { _id: true });

const PrescriptionSchema = new mongoose.Schema({
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null },
  consultationFee: { type: Number, default: 0 },
  medications: [MedicationSchema],
  reports: [ReportAttachmentSchema], // Lab report attachments
  status: { type: String, enum: ['active', 'completed', 'cancelled'], default: 'active' }
}, { timestamps: true });

module.exports = mongoose.model('Prescription', PrescriptionSchema);
