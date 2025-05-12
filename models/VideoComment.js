const mongoose = require('mongoose');

const VideoCommentSchema = new mongoose.Schema({
  content: {
    type: String,
    required: true,
    trim: true
  },
  video: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BookVideo',
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('VideoComment', VideoCommentSchema);