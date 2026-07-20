// models/User.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
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
    default: 'User'
  },
  isDoctor: {
    type: Boolean,
    default: false
  },
  location: {
    roomNo: { type: String, trim: true, default: '' },
    floorNo: { type: Number, default: 0 },
    landmark: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: 'New Delhi' },
    state: { type: String, trim: true, default: 'Delhi' },
    pincode: { type: String, default: '110001' }
  },
  coordinates: {
    type: [Number],
    default: [77.2090, 28.6139] // [longitude, latitude]
  },
  managedProfiles: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  pendingProfileRequests: [{
    fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    fromEmail: { type: String, trim: true, lowercase: true },
    status: { type: String, default: 'pending' }
  }],
  bloodGroup: {
    type: String,
    default: 'A+'
  },
  prescriptions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Prescription'
  }],
  reports: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Report'
  }],
  doctorDetails: {
    certificateNo: { type: String, default: '', trim: true },
    certificateDoc: { type: String, default: '', trim: true },
    affiliateOrganization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null },
    affiliateOrganizationApprovalStatus: { type: String, default: 'pending' },
    speciality: { type: String, default: 'General Medicine', trim: true },
    managerApprovalStatus: { type: String, default: 'pending' }
  }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);