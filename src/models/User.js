// models/User.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 20
  },
  password: {
    type: String,
    required: true,
    minlength: 6,
    maxlength: 20,
    trim: true
  },
  isDoctor: {
    type: Boolean,
    default: false
  },
  location: {
    roomNo: { type: String, trim: true },
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
  managedProfiles: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  bloodGroup: {
    type: String,
    enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
    default: null
  },
  prescriptions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Prescription'
  }],
  // Conditional Object structured strictly according to your rules
  doctorDetails: {
    certificateNo: { type: String, default: null },
    certificateDoc: { type: String, default: null },
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null },
    organizationApprovalStatus: { type: String, enum: ['pending', 'approved', 'rejected', null], default: null },
    speciality: { type: String, default: null },
    managerApprovalStatus: { type: String, enum: ['pending', 'approved', 'rejected', null], default: null }
  }
}, { timestamps: true });

UserSchema.index({ coordinates: '2dsphere' });

// Validation and Nullification Layer
UserSchema.pre('save', function(next) {
  if (this.isDoctor) {
    const details = this.doctorDetails;
    // Enforce presence of required doctor credentials manually since fields are technically nullable
    if (!details.certificateNo || !details.certificateDoc || !details.organizationId || !details.speciality) {
      return next(new Error('Validation Failed: Doctor details are mandatory when isDoctor is true.'));
    }
    // Set default statuses if they are new or empty
    if (!details.organizationApprovalStatus) details.organizationApprovalStatus = 'pending';
    if (!details.managerApprovalStatus) details.managerApprovalStatus = 'pending';
  } else {
    // Force evaluation to null if the user is strictly a patient
    this.doctorDetails = {
      certificateNo: null,
      certificateDoc: null,
      organizationId: null,
      organizationApprovalStatus: null,
      speciality: null,
      managerApprovalStatus: null
    };
  }
  next();
});

module.exports = mongoose.model('User', UserSchema);