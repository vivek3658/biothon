// models/Organization.js
const mongoose = require('mongoose');

const OrganizationSchema = new mongoose.Schema({
  accountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    default: 'Healthcare Facility'
  },
  facilityType: {
    type: String,
    required: true,
    enum: ['hospital', 'clinic', 'laboratory'],
    default: 'hospital'
  },
  contactNumber: {
    type: String,
    required: true,
    trim: true,
    default: '+91 9876543210'
  },
  location: {
    buildingNo: { type: String, trim: true, default: '' },
    floorNo: { type: Number, default: 0 },
    landmark: { type: String, trim: true, default: '' },
    city: { type: String, required: true, trim: true, default: 'New Delhi' },
    state: { type: String, required: true, trim: true, default: 'Delhi' },
    pincode: { type: String, required: true, default: '110001' }
  },
  coordinates: {
    type: [Number],
    default: [77.2090, 28.6139] // [longitude, latitude]
  },
  verificationStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  organizationCertificateNo: {
    type: String,
    required: true,
    trim: true,
    default: () => `REG-${Date.now()}`
  },
  organizationCertificateUrl: {
    type: String,
    required: true,
    default: 'https://example.com/cert.pdf'
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

module.exports = mongoose.model('Organization', OrganizationSchema);