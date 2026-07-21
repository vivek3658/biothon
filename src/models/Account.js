// models/Account.js
const mongoose = require('mongoose');

const AccountSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: false
  },
  googleId: {
    type: String,
    trim: true,
    default: null
  },
  authProvider: {
    type: String,
    enum: ['local', 'google'],
    default: 'local'
  },
  role: {
    type: String,
    required: true,
    enum: ['patient', 'doctor', 'hospital', 'clinic', 'laboratory', 'pharmacy', 'other']
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    //required: true,
    refPath: 'entityModel'
  },
  entityModel: {
    type: String,
    required: true,
    enum: ['User', 'Organization']
  },
}, { timestamps: true });

module.exports = mongoose.model('Account', AccountSchema);
