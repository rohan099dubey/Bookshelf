const mongoose = require('mongoose');

const ComplaintSchema = new mongoose.Schema({
  subject: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false // Not required for guest submissions
  },
  guestInfo: {
    name: String,
    email: String
  },
  userRole: {
    type: String,
    enum: ['buyer', 'seller', 'guest', 'admin'],
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'in-progress', 'resolved', 'rejected'],
    default: 'pending'
  },
  adminResponse: {
    type: String,
    trim: true,
    default: ''
  },
  source: {
    type: String,
    enum: ['contact_form', 'complaint_form'],
    default: 'complaint_form'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Complaint', ComplaintSchema);