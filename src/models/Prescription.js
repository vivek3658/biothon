// models/Prescription.js
const mongoose = require('mongoose');

const MedicationSchema = new mongoose.Schema({
  medicineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', default: null },
  medicineName: { type: String, required: true, trim: true },
  genericName: { type: String, trim: true, default: '' },
  type: { type: String, default: 'Tablet' },
  dosage: { type: String, required: true, default: '500' },
  unit: { type: String, default: 'mg' },
  frequency: { type: String, default: '1-0-1' },
  mealTiming: { type: String, enum: ['Before Food', 'After Food', 'With Food', 'Empty Stomach'], default: 'After Food' },
  durationDays: { type: Number, default: 5 },
  quantity: { type: String, default: '10' },
  instructions: { type: String, default: '' },
  price: { type: Number, default: 0 },
  orderIndex: { type: Number, default: 0 }
}, { _id: true });

const LabOrderEntrySchema = new mongoose.Schema({
  testName: { type: String, required: true, trim: true },
  clinicalInstructions: { type: String, default: '' },
  priority: { type: String, enum: ['routine', 'urgent', 'stat'], default: 'routine' }
}, { _id: true });

const PrescriptionSchema = new mongoose.Schema({
  prescriptionNumber: { type: String, required: true, unique: true, index: true },
  version: { type: Number, default: 1 },
  isLatestVersion: { type: Boolean, default: true, index: true },
  rootPrescriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Prescription', default: null, index: true },
  
  appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', default: null, index: true },
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
  
  chiefComplaint: { type: String, trim: true, default: 'Routine Clinical Consultation' },
  clinicalFindings: { type: String, trim: true, default: '' },
  diagnosis: [{ type: String, trim: true }],
  lifestyleAdvice: [{ type: String, trim: true }],
  doctorNotes: { type: String, trim: true, default: '' },
  
  consultationFee: { type: Number, default: 0 },
  medications: [MedicationSchema],
  labOrders: [LabOrderEntrySchema],
  
  followUpDate: { type: String, default: '' }, // YYYY-MM-DD
  followUpPurpose: { type: String, default: 'Review' },
  
  allergyOverrideLog: [{
    allergenName: String,
    medicineName: String,
    overrideReason: String,
    overriddenAt: { type: Date, default: Date.now }
  }],
  
  interactionWarnings: [{
    drugA: String,
    drugB: String,
    severity: { type: String, enum: ['Minor', 'Moderate', 'Major'] },
    description: String
  }],
  
  status: { 
    type: String, 
    enum: ['draft', 'finalized', 'superseded', 'cancelled', 'active'], 
    default: 'finalized', 
    index: true 
  },
  finalizedAt: { type: Date, default: () => new Date() },
  digitalSignature: { type: String, default: '' },
  qrCodeToken: { type: String, unique: true, sparse: true, index: true }
}, { timestamps: true });

PrescriptionSchema.index({ patientId: 1, createdAt: -1 });
PrescriptionSchema.index({ doctorId: 1, createdAt: -1 });

module.exports = mongoose.model('Prescription', PrescriptionSchema);
