// models/Medicine.js
const mongoose = require('mongoose');

const MedicineSchema = new mongoose.Schema({
  medicineName: {
    type: String,
    required: true,
    trim: true,
    unique: true
  },
  type: {
    type: String,
    required: true,
    enum: ['oral_tablet', 'capsule', 'syrup', 'injection', 'lotion', 'gel', 'ointment', 'drops', 'inhaler'],
    default: 'oral_tablet'
  },
  dosage: {
    type: [Number], // Available dosage options, e.g. [250, 500, 650]
    required: true,
    default: [500]
  },
  unit: {
    type: String,
    required: true,
    enum: ['mg', 'ml', 'g', 'mcg', 'IU', 'puffs'],
    default: 'mg'
  },
  category: {
    type: String,
    trim: true,
    default: 'General'
  },
  manufacturer: {
    type: String,
    trim: true,
    default: ''
  },
  prescriptionRequired: {
    type: Boolean,
    default: true
  },
  instructions: {
    type: String,
    trim: true,
    default: 'Take as directed by practitioner.'
  },
  sideEffects: {
    type: String,
    trim: true,
    default: ''
  },
  precautions: {
    type: String,
    trim: true,
    default: ''
  }
}, { timestamps: true });

module.exports = mongoose.model('Medicine', MedicineSchema);
