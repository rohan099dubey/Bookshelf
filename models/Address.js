/**
 * Address model for storing multiple user addresses
 */

const mongoose = require("mongoose");

// Create the schema definition
const AddressSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  phone: {
    type: String,
    required: true,
    match: [/^\d{10}$/, "Please enter a valid 10-digit phone number"],
  },
  street: {
    type: String,
    required: true,
    trim: true,
  },
  city: {
    type: String,
    required: true,
    trim: true,
  },
  state: {
    type: String,
    required: true,
    trim: true,
  },
  zipCode: {
    type: String,
    required: true,
    trim: true,
    match: [/^\d{6}$/, "Please enter a valid 6-digit PIN code"],
  },
  country: {
    type: String,
    default: "India",
    trim: true,
  },
  isDefault: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Create and export the model safely
let Address;
try {
  // First, try to retrieve the existing model to avoid the "Cannot overwrite `Address` model once compiled" error
  Address = mongoose.model("Address");
} catch (error) {
  // Model doesn't exist yet, so create it
  Address = mongoose.model("Address", AddressSchema);
}

module.exports = Address;