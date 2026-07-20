const mongoose = require('mongoose');

const PharmacyInventorySchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  medicineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true },
  companyName: { type: String, required: true, trim: true },
  price: { type: Number, required: true, min: 0 },
  stock: { type: Number, default: 0, min: 0 },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

PharmacyInventorySchema.index({ organizationId: 1, medicineId: 1, companyName: 1 }, { unique: true });

module.exports = mongoose.model('PharmacyInventory', PharmacyInventorySchema);
