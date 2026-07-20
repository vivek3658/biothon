// models/Organization.js
const mongoose = require('mongoose');

const OrganizationSchema = new mongoose.Schema({
  // The primary key reference back to the parent Account identity
  accountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  facilityType: {
    type: String,
    required: true,
    enum: ['hospital', 'clinic', 'laboratory']
  },
  contactNumber: {
    type: String,
    required: true,
    trim: true
  },
  location: {
    buildingNo: { type: String, trim: true },
    floorNo: { type: Number, default: 0 },
    landmark: { type: String, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    pincode: { type: String, required: true, match: /^[0-9]{6}$/ }
  },
  coordinates: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true } // [longitude, latitude]
  },
  verificationStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  organizationCertificateNo: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  organizationCertificateUrl: {
    type: String,
    required: true
  },
  doctors: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  workingDays: [{
    type: String,
    enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  }],
  specialities: [{
    type: String,
    trim: true
  }]
}, { timestamps: true });

OrganizationSchema.index({ coordinates: '2dsphere' });

module.exports = mongoose.model('Organization', OrganizationSchema);    