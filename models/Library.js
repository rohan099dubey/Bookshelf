const mongoose = require("mongoose");

// Define a schema for library items
const LibraryItemSchema = new mongoose.Schema({
  book: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Book",
    required: true
  },
  progress: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  currentPage: {
    type: Number,
    default: 1
  },
  isBookmarked: {
    type: Boolean,
    default: false
  },
  bookmarkPage: {
    type: Number,
    default: null
  },
  accessCount: {
    type: Number,
    default: 0
  },
  lastAccessed: {
    type: Date,
    default: Date.now
  },
  addedAt: {
    type: Date,
    default: Date.now
  }
});

// Define the main Library schema
const LibrarySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  items: [LibraryItemSchema], // Array of library items
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Library", LibrarySchema);