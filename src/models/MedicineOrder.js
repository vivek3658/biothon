const mongoose = require('mongoose');

const MedicineOrderItemSchema = new mongoose.Schema({
  inventoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'PharmacyInventory', required: true },
  medicineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true },
  medicineName: { type: String, required: true, trim: true },
  companyName: { type: String, required: true, trim: true },
  quantity: { type: Number, default: 1, min: 1 },
  price: { type: Number, default: 0, min: 0 }
}, { _id: true });

const MedicineOrderSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  prescriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Prescription', default: null },
  items: [MedicineOrderItemSchema],
  status: { type: String, enum: ['pending', 'confirmed', 'packed', 'completed', 'cancelled'], default: 'pending' },
  totalAmount: { type: Number, default: 0, min: 0 }
}, { timestamps: true });

module.exports = mongoose.model('MedicineOrder', MedicineOrderSchema);
