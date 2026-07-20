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
    city: { type: String, required: true, trim: true, default: 'New Delhi' },
    state: { type: String, required: true, trim: true, default: 'Delhi' },
    pincode: { type: String, required: true, default: '110001' }
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
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' }
  }],
  bloodGroup: {
    type: String,
    enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', null],
    default: null
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
    certificateNo: { type: String, default: null, trim: true },
    certificateDoc: { type: String, default: null, trim: true },
    affiliateOrganization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null },
    affiliateOrganizationApprovalStatus: { type: String, enum: ['pending', 'approved', 'rejected', null], default: null },
    speciality: { type: String, default: null, trim: true },
    managerApprovalStatus: { type: String, enum: ['pending', 'approved', 'rejected', null], default: null }
  }
}, { timestamps: true });

// Pre-save validation & default assignments for Doctor vs Patient
UserSchema.pre('save', function() {
  if (this.isDoctor) {
    if (!this.doctorDetails) {
      this.doctorDetails = {};
    }
    if (!this.doctorDetails.affiliateOrganizationApprovalStatus) {
      this.doctorDetails.affiliateOrganizationApprovalStatus = 'pending';
    }
    if (!this.doctorDetails.managerApprovalStatus) {
      this.doctorDetails.managerApprovalStatus = 'pending';
    }
  } else {
    this.doctorDetails = {
      certificateNo: null,
      certificateDoc: null,
      affiliateOrganization: null,
      affiliateOrganizationApprovalStatus: null,
      speciality: null,
      managerApprovalStatus: null
    };
  }
});

module.exports = mongoose.model('User', UserSchema);