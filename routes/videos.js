const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { ensureAuthenticated } = require('../middleware/auth');
const Book = require('../models/Book');
const BookVideo = require('../models/BookVideo');
const VideoComment = require('../models/VideoComment');

// Configure multer for video uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = 'public/uploads/videos';
    if (!fs.existsSync(dir)){
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only video files are allowed!'), false);
    }
  }
});

// Upload video form
router.get('/upload', ensureAuthenticated, async (req, res) => {
  try {
    if (req.user.role !== 'buyer') {
      req.flash('error_msg', 'Only buyers can upload videos');
      return res.redirect('/');
    }
    
    const books = await Book.find().sort('title');
    
    res.render('buyer/upload-video', { 
      title: 'Upload Book Review Video',
      user: req.user,
      books
    });
  } catch (err) {
    console.error('Error in upload form:', err);
    req.flash('error_msg', 'Error loading upload form');
    return res.redirect('/buyer/video-feed');
  }
});

// Process video upload
router.post('/upload', ensureAuthenticated, upload.single('video'), async (req, res) => {
  try {
    if (req.user.role !== 'buyer') {
      req.flash('error_msg', 'Only buyers can upload videos');
      return res.redirect('/');
    }
    
    const { title, description, bookId, tags } = req.body;
    
    // Validate input
    if (!title || !bookId || !req.file) {
      req.flash('error_msg', 'Missing required fields');
      return res.redirect('/videos/upload');
    }
    
    // Create thumbnail (here we'd normally generate one from the video)
    // For now, use a default thumbnail
    const thumbnailUrl = '/img/default-thumbnail.jpg';
    
    // Create new video document
    const newVideo = new BookVideo({
      title,
      description: description || '',
      videoUrl: `/uploads/videos/${req.file.filename}`,
      thumbnailUrl,
      book: bookId,
      user: req.user._id,
      views: 0,
      likes: [],
      duration: 90, // Default 90 seconds; in a real app, you'd extract this
      tags: tags ? tags.split(',').map(tag => tag.trim()).filter(Boolean) : []
    });
    
    await newVideo.save();
    
    req.flash('success_msg', 'Video uploaded successfully');
    res.redirect('/buyer/video-feed');
  } catch (err) {
    console.error('Error uploading video:', err);
    req.flash('error_msg', 'Error uploading video');
    return res.redirect('/videos/upload');
  }
});

// View a specific video
router.get('/watch/:id', ensureAuthenticated, async (req, res) => {
  try {
    if (req.user.role !== 'buyer') {
      req.flash('error_msg', 'Only buyers can view videos');
      return res.redirect('/');
    }
    
    const videoId = req.params.id;
    
    // Find video and increment view count
    const video = await BookVideo.findById(videoId)
      .populate('user', 'name avatar')
      .populate('book', 'title author coverImage');
    
    if (!video) {
      req.flash('error_msg', 'Video not found');
      return res.redirect('/buyer/video-feed');
    }
    
    // Increment views
    video.views = (video.views || 0) + 1;
    await video.save();
    
    // Get comments
    const comments = await VideoComment.find({ video: videoId })
      .populate('user', 'name avatar')
      .sort('-createdAt');
    
    // Get related videos (by same book or tags)
    const relatedVideos = await BookVideo.find({
      _id: { $ne: videoId },
      $or: [
        { book: video.book._id },
        { tags: { $in: video.tags } }
      ]
    })
    .limit(5)
    .populate('user', 'name avatar')
    .sort('-views');
    
    res.render('buyer/video-watch', {
      title: video.title + ' - Bookish',
      video,
      comments,
      relatedVideos,
      user: req.user
    });
  } catch (err) {
    console.error('Error watching video:', err);
    req.flash('error_msg', 'Error loading video');
    return res.redirect('/buyer/video-feed');
  }
});

// Like/unlike a video
router.post('/like/:id', ensureAuthenticated, async (req, res) => {
  try {
    if (req.user.role !== 'buyer') {
      return res.status(403).json({ success: false, message: 'Only buyers can like videos' });
    }
    
    const videoId = req.params.id;
    const userId = req.user._id;
    
    const video = await BookVideo.findById(videoId);
    if (!video) {
      return res.status(404).json({ success: false, message: 'Video not found' });
    }
    
    // Check if already liked
    const likeIndex = video.likes.indexOf(userId);
    
    if (likeIndex === -1) {
      // Add like
      video.likes.push(userId);
    } else {
      // Remove like
      video.likes.splice(likeIndex, 1);
    }
    
    await video.save();
    
    return res.json({ 
      success: true, 
      liked: likeIndex === -1, 
      likeCount: video.likes.length 
    });
  } catch (err) {
    console.error('Error liking video:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Add a comment
router.post('/comment/:id', ensureAuthenticated, async (req, res) => {
  try {
    if (req.user.role !== 'buyer') {
      return res.status(403).json({ success: false, message: 'Only buyers can comment' });
    }
    
    const { content } = req.body;
    const videoId = req.params.id;
    
    if (!content) {
      return res.status(400).json({ success: false, message: 'Comment cannot be empty' });
    }
    
    // Check if video exists
    const video = await BookVideo.findById(videoId);
    if (!video) {
      return res.status(404).json({ success: false, message: 'Video not found' });
    }
    
    // Create and save comment
    const newComment = new VideoComment({
      content,
      video: videoId,
      user: req.user._id
    });
    
    await newComment.save();
    
    // Populate user info for response
    await newComment.populate('user', 'name avatar');
    
    return res.status(201).json({
      success: true,
      comment: newComment
    });
  } catch (err) {
    console.error('Error adding comment:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;