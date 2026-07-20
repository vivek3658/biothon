// models/Manager.js
const mongoose = require('mongoose');

const ManagerSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  name: {
    type: String,
    trim: true,
    default: ''
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    default: ''
  },
  role: {
    type: String,
    enum: ['manager'],
    default: 'manager'
  },
  createdBy: {
    type: String,
    default: 'admin'
  }
}, { timestamps: true });

module.exports = mongoose.model('Manager', ManagerSchema);
