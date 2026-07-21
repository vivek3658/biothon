const mongoose = require('mongoose');

const MedicineSchema = new mongoose.Schema({
  medicineName: { type: String, required: true, trim: true, index: true },
  genericName: { type: String, required: true, trim: true, default: '', index: true },
  brandName: { type: String, required: true, trim: true, default: '', index: true },
  manufacturer: { type: String, required: true, trim: true, default: 'ArogyaX Pharma', index: true },
  
  medicineType: { 
    type: String, 
    enum: ['Tablet', 'Capsule', 'Injection', 'Syrup', 'Drops', 'Cream', 'Ointment', 'Inhaler', 'Powder'], 
    default: 'Tablet',
    required: true 
  },
  
  strength: { type: String, required: true, trim: true, default: '500mg' }, // e.g. "500mg", "10ml"
  composition: [{ type: String, trim: true }], // e.g. ["Paracetamol 500mg"]
  category: { type: String, required: true, trim: true, default: 'General', index: true },
  
  scheduleType: { 
    type: String, 
    enum: ['OTC', 'Schedule_H', 'Schedule_H1', 'Schedule_X', 'Controlled'], 
    default: 'OTC' 
  },
  
  requiresPrescription: { type: Boolean, default: true },
  availableStrengths: [{ type: String }],
  availablePackSizes: [{ type: String }],
  
  defaultInstructions: { type: String, trim: true, default: 'Take as directed by practitioner.' },
  commonSideEffects: [{ type: String }],
  contraindications: [{ type: String }],
  storageInstructions: { type: String, default: 'Store in a cool, dry place away from direct sunlight.' },
  
  pregnancyCategory: { type: String, enum: ['A', 'B', 'C', 'D', 'X', 'N'], default: 'B' },
  childSafe: { type: Boolean, default: true },
  seniorSafe: { type: Boolean, default: true },
  
  status: { type: String, enum: ['active', 'inactive', 'archived'], default: 'active', index: true },
  isDeleted: { type: Boolean, default: false, index: true },
  deletedAt: { type: Date, default: null }
}, { timestamps: true });

// Text Index for Instant Autocomplete Search
MedicineSchema.index({ medicineName: 'text', genericName: 'text', brandName: 'text', composition: 'text' });
MedicineSchema.index({ genericName: 1, strength: 1, isDeleted: 1 });

module.exports = mongoose.model('Medicine', MedicineSchema);
