/**
 * Buyer routes for browsing books, managing cart, and viewing library
 */

const express = require("express")
const router = express.Router()
const Book = require("../models/Book")
const Cart = require("../models/Cart")
const Order = require("../models/Order")
const Subscription = require("../models/Subscription");
const Library = require("../models/Library");
const BookVideo = require("../models/BookVideo");
const VideoComment = require('../models/VideoComment');
const User = require('../models/User');  // Add this line
const { ensureAuthenticated, ensureBuyer } = require("../middleware/auth")
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const Address = require('../models/Address');
const bcrypt = require('bcryptjs');
const Complaint = require('../models/Complaint');

/**
 * @route   GET /buyer/cart
 * @desc    View shopping cart
 * @access  Private (Buyer)
 */
router.get("/cart", ensureAuthenticated, ensureBuyer, async (req, res) => {
  try {
    let cart = await Cart.findOne({ user: req.user._id }).populate({
      path: "items.book",
      select: "title author coverImage price condition",
    })

    if (!cart) {
      cart = { items: [], totalAmount: 0 }
    }

    res.render("buyer/cart", {
      title: "Your Cart - Bookish",
      cart,
      user: req.user,
    })
  } catch (err) {
    console.error(err)
    req.flash("error_msg", "Error fetching cart")
    res.redirect("/buyer/browse")
  }
})

/**
 * @route   POST /buyer/cart/add/:bookId
 * @desc    Add book to cart
 * @access  Private (Buyer)
 */
router.post(
  "/cart/add/:bookId",
  ensureAuthenticated,
  ensureBuyer,
  async (req, res) => {
    try {
      const { quantity = 1 } = req.body
      const bookId = req.params.bookId

      // Find book
      const book = await Book.findById(bookId)

      if (!book || !book.isAvailable || !book.isApproved) {
        req.flash("error_msg", "Book not available")
        return res.redirect("/buyer/browse");
      }

      // Check stock
      if (book.stock < quantity) {
        req.flash("error_msg", "Not enough stock available")
        return res.redirect(`/buyer/book/${bookId}`);
      }

      // Find or create cart
      let cart = await Cart.findOne({ user: req.user._id })

      if (!cart) {
        cart = new Cart({
          user: req.user._id,
          items: [],
          totalAmount: 0,
        })
      }

      // Check if book already in cart
      const itemIndex = cart.items.findIndex((item) => item.book.toString() === bookId)

      if (itemIndex > -1) {
        // Book exists in cart, update quantity
        cart.items[itemIndex].quantity += Number(quantity)
      } else {
        // Add new item to cart
        cart.items.push({
          book: bookId,
          quantity: Number(quantity),
          price: book.discountPrice || book.price,
        })
      }

      await cart.save()

      req.flash("success_msg", "Book added to cart")
      res.redirect("/buyer/cart")
    } catch (err) {
      console.error(err)
      req.flash("error_msg", "Error adding book to cart")
      res.redirect("/buyer/browse")
    }
  }
)

/**
 * @route   POST /buyer/cart/update/:itemId
 * @desc    Update cart item quantity
 * @access  Private (Buyer)
 */
router.post(
  "/cart/update/:itemId",
  ensureAuthenticated,
  ensureBuyer,
  async (req, res) => {
    try {
      const { quantity } = req.body
      const itemId = req.params.itemId

      // Find cart
      const cart = await Cart.findOne({ user: req.user._id })

      if (!cart) {
        req.flash("error_msg", "Cart not found")
        return res.redirect("/buyer/cart");
      }

      // Find item in cart
      const item = cart.items.id(itemId)

      if (!item) {
        req.flash("error_msg", "Item not found in cart")
        return res.redirect("/buyer/cart");
      }

      // Check if quantity is valid
      if (quantity < 1) {
        req.flash("error_msg", "Quantity must be at least 1")
        return res.redirect("/buyer/cart");
      }

      // Update quantity
      item.quantity = Number(quantity)
      await cart.save()

      req.flash("success_msg", "Cart updated")
      res.redirect("/buyer/cart")
    } catch (err) {
      console.error(err)
      req.flash("error_msg", "Error updating cart")
      res.redirect("/buyer/cart")
    }
  }
)

/**
 * @route   POST /buyer/cart/remove/:itemId
 * @desc    Remove item from cart
 * @access  Private (Buyer)
 */
router.post(
  "/cart/remove/:itemId",
  ensureAuthenticated,
  ensureBuyer,
  async (req, res) => {
    try {
      const itemId = req.params.itemId

      // Find cart
      const cart = await Cart.findOne({ user: req.user._id })

      if (!cart) {
        req.flash("error_msg", "Cart not found")
        return res.redirect("/buyer/cart");
      }

      // Remove item from cart
      cart.items.pull(itemId)
      await cart.save()

      req.flash("success_msg", "Item removed from cart")
      res.redirect("/buyer/cart")
    } catch (err) {
      console.error(err)
      req.flash("error_msg", "Error removing item from cart")
      res.redirect("/buyer/cart")
    }
  }
)

/**
 * @route   POST /buyer/cart/clear
 * @desc    Clear all items from cart
 * @access  Private (Buyer)
 */
router.post("/cart/clear", ensureAuthenticated, ensureBuyer, async (req, res) => {
  try {
    // Find the user's cart
    const cart = await Cart.findOne({ user: req.user._id });
    
    if (!cart) {
      req.flash("error_msg", "Cart not found");
      return res.redirect("/buyer/cart");
    }
    
    // Clear all items from the cart
    cart.items = [];
    cart.totalAmount = 0;
    await cart.save();
    
    req.flash("success_msg", "Cart cleared successfully");
    res.redirect("/buyer/cart");
  } catch (err) {
    console.error(err);
    req.flash("error_msg", "Error clearing cart");
    res.redirect("/buyer/cart");
  }
});

/**
 * @route   GET /buyer/checkout
 * @desc    Checkout page
 * @access  Private (Buyer)
 */
router.get("/checkout", ensureAuthenticated, ensureBuyer, async (req, res) => {
  try {
    // Get the cart
    let cart = await Cart.findOne({ user: req.user._id }).populate({
      path: "items.book",
      select: "title author coverImage price condition stock seller",
    });

    if (!cart || cart.items.length === 0) {
      req.flash("error_msg", "Your cart is empty");
      return res.redirect("/buyer/cart");
    }

    // Check if all items are in stock
    let outOfStock = false;
    cart.items.forEach(item => {
      if (item.book.stock < item.quantity) {
        outOfStock = true;
        req.flash("error_msg", `${item.book.title} is out of stock or has insufficient quantity`);
      }
    });

    if (outOfStock) {
      return res.redirect("/buyer/cart");
    }

    // Calculate totals
    const subtotal = cart.items.reduce((total, item) => total + (item.price * item.quantity), 0);
    const shipping = 50; // Fixed shipping cost
    const tax = Math.round(subtotal * 0.18); // 18% GST
    const total = subtotal + shipping + tax;

    // Get user's default address only
    const defaultAddress = await Address.findOne({ 
      user: req.user._id,
      isDefault: true 
    });

    res.render("buyer/checkout", {
      title: "Checkout - Bookish",
      cart,
      user: req.user,
      subtotal,
      shipping,
      tax,
      total,
      defaultAddress,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY
    });
  } catch (err) {
    console.error(err);
    req.flash("error_msg", "Error loading checkout page");
    res.redirect("/buyer/cart");
  }
});

/**
 * @route   POST /buyer/create-payment-intent
 * @desc    Create a Stripe payment intent
 * @access  Private (Buyer)
 */
router.post("/create-payment-intent", ensureAuthenticated, ensureBuyer, async (req, res) => {
  try {
    const { amount } = req.body;
    
    // Create a PaymentIntent with the order amount and currency
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount), // Stripe requires integer amount in smallest currency unit (paise)
      currency: "inr",
      // Store user and cart info in metadata for reference
      metadata: { 
        user_id: req.user._id.toString(),
      },
    });
    
    res.status(200).json({
      clientSecret: paymentIntent.client_secret,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * @route   GET /buyer/payment-completion
 * @desc    Handle payment completion redirect from Stripe
 * @access  Private (Buyer)
 */
router.get("/payment-completion", ensureAuthenticated, ensureBuyer, (req, res) => {
  res.render("buyer/payment-completion", {
    title: "Payment Status - Bookish",
    user: req.user,
  });
});

/**
 * @route   POST /buyer/confirm-payment
 * @desc    Confirm payment and create order
 * @access  Private (Buyer)
 */
router.post("/confirm-payment", ensureAuthenticated, ensureBuyer, async (req, res) => {
  try {
    const { paymentIntent, paymentIntentClientSecret } = req.body;
    
    // Retrieve the payment intent from Stripe to verify
    const intent = await stripe.paymentIntents.retrieve(paymentIntent);
    
    // Verify payment is successful and belongs to this user
    if (intent.status !== 'succeeded') {
      return res.status(400).json({ success: false, message: "Payment not successful" });
    }
    
    // Find the user's cart
    const cart = await Cart.findOne({ user: req.user._id }).populate("items.book");
    
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ success: false, message: "Cart is empty" });
    }
    
    // Get shipping details from address or payment method
    let shippingAddress;
    
    // Try to get address from the selected address ID
    const defaultAddress = await Address.findOne({ 
      user: req.user._id,
      isDefault: true 
    });
    
    if (defaultAddress) {
      shippingAddress = {
        name: req.user.name,
        address: defaultAddress.street,
        city: defaultAddress.city,
        state: defaultAddress.state,
        pincode: defaultAddress.zipCode,
        phone: defaultAddress.phone
      };
    } else {
      // Fall back to payment method billing details
      const paymentMethod = await stripe.paymentMethods.retrieve(intent.payment_method);
      const billingDetails = paymentMethod.billing_details;
      
      shippingAddress = {
        name: req.user.name,
        address: billingDetails.address?.line1 || "Default Street",
        city: billingDetails.address?.city || "Default City",
        state: billingDetails.address?.state || "Default State",
        pincode: billingDetails.address?.postal_code || "123456",
        phone: billingDetails.phone || req.user.phone || "1234567890"
      };
    }
    
    // Generate orderId manually to ensure it's set before saving
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    const orderId = `ORD${year}${month}${day}${random}`;
    
    // Create new order with required fields
    const newOrder = new Order({
      orderId, // Set the orderId explicitly
      buyer: req.user._id,
      items: cart.items.map(item => ({
        book: item.book._id,
        title: item.book.title,
        author: item.book.author,
        coverImage: item.book.coverImage,
        price: item.price,
        quantity: item.quantity,
        seller: item.book.seller
      })),
      totalAmount: intent.amount / 100, // Convert from paise to rupees
      shippingAddress: shippingAddress,
      paymentMethod: "credit_card",
      paymentStatus: "completed",
      orderStatus: "processing",
      paymentDetails: {
        paymentId: intent.id,
        amount: intent.amount / 100,
        status: intent.status
      }
    });
    
    // Save the order
    await newOrder.save();

    // Update book stock
    for (const item of cart.items) {
      await Book.findByIdAndUpdate(item.book._id, {
        $inc: { stock: -item.quantity }
      });
    }

    // Clear the cart
    await Cart.findByIdAndDelete(cart._id);

    return res.status(200).json({ 
      success: true, 
      message: "Payment successful and order created",
      orderId: newOrder.orderId
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error during payment processing" });
  }
});

/**
 * @route   POST /buyer/process-payment
 * @desc    Process payment and create order
 * @access  Private (Buyer)
 */
router.post("/process-payment", ensureAuthenticated, ensureBuyer, async (req, res) => {
  try {
    const { payment_id, order_id, signature, amount, address, city, state, pincode, phone } = req.body;
    
    // Find the user's cart
    const cart = await Cart.findOne({ user: req.user._id }).populate("items.book");
    
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ success: false, message: "Cart is empty" });
    }

    // Create shipping address
    const shippingAddress = {
      address,
      city,
      state,
      pincode,
      phone
    };

    // Create new order
    const newOrder = new Order({
      user: req.user._id,
      items: cart.items.map(item => ({
        book: item.book._id,
        title: item.book.title,
        author: item.book.author,
        coverImage: item.book.coverImage,
        price: item.price,
        quantity: item.quantity,
        seller: item.book.seller
      })),
      totalAmount: amount / 100, // Convert from paise to rupees
      shippingAddress,
      paymentDetails: {
        id: payment_id,
        orderId: order_id,
        signature: signature
      },
      orderStatus: "processing"
    });

    await newOrder.save();

    // Update book stock
    for (const item of cart.items) {
      await Book.findByIdAndUpdate(item.book._id, {
        $inc: { stock: -item.quantity }
      });
    }

    // Clear the cart
    await Cart.findByIdAndDelete(cart._id);

    return res.status(200).json({ 
      success: true, 
      message: "Payment successful and order created",
      orderId: newOrder._id
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error during payment processing" });
  }
});

/**
 * @route   GET /buyer/payment-success
 * @desc    Display payment success page
 * @access  Private
 */
router.get("/payment-success", ensureAuthenticated, ensureBuyer, async (req, res) => {
  try {
    const orderId = req.query.order_id;
    
    if (!orderId) {
      return res.redirect("/buyer/orders");
    }
    
    res.render("buyer/payment-success", {
      title: "Payment Successful - Bookish",
      orderId: orderId
    });
  } catch (err) {
    console.error(err);
    req.flash("error_msg", "Error displaying payment success page");
    res.redirect("/buyer/orders");
  }
});

/**
 * @route   GET /buyer/library
 * @desc    View user's library with subscription check
 * @access  Private
 */
router.get("/library", ensureAuthenticated, async (req, res) => {
  try {
    // Check subscription status
    const subscription = await Subscription.findOne({
      user: req.user._id,
      isActive: true,
      endDate: { $gt: new Date() }
    });
    
    const hasSubscription = !!subscription;
    
    // Get library only if user has a subscription
    let library = [];
    
    if (hasSubscription) {
      let userLibrary = await Library.findOne({ user: req.user._id }).populate({
        path: "items.book",
        select: "title author coverImage format description"
      });
      
      if (userLibrary) {
        library = userLibrary.items || [];
      }
    }
    
    res.render("buyer/library", {
      title: "My Library - Bookish",
      user: req.user,
      library: library,
      hasSubscription: hasSubscription,
      subscription: subscription || {}
    });
  } catch (err) {
    console.error(err);
    req.flash("error_msg", "Error loading your library");
    res.redirect("/buyer/browse");
  }
});

/**
 * @route   GET /buyer/video-feed
 * @desc    Display video feed for buyers
 * @access  Private (but visible to all buyers)
 */
router.get('/video-feed', ensureAuthenticated, async (req, res) => {
  try {
    // Check if user is a buyer
    if (req.user.role !== 'buyer') {
      req.flash('error_msg', 'You do not have permission to access this page');
      return res.redirect('/');
    }
    
    // Fetch all videos and populate with user and book info
    const videos = await BookVideo.find()
      .sort({ createdAt: -1 })
      .populate('user', 'name avatar')
      .populate('book', 'title author coverImage');
    
    res.render('buyer/video-feed', {
      title: 'Book Video Feed - Bookish',
      videos,
      user: req.user
    });
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error loading videos');
    res.redirect('/buyer/browse');
  }
});

/**
 * @route   GET /buyer/video-feed/watch/:id
 * @desc    Watch a specific video
 * @access  Private (Buyer)
 */
router.get('/video-feed/watch/:id', ensureAuthenticated, async (req, res) => {
  try {
    if (req.user.role !== 'buyer') {
      req.flash('error_msg', 'Not authorized');
      return res.redirect('/');
    }
    
    const videoId = req.params.id;
    
    // Find video and populate related data
    const video = await BookVideo.findById(videoId)
      .populate('user', 'name avatar')
      .populate('book', 'title author coverImage');
    
    if (!video) {
      req.flash('error_msg', 'Video not found');
      return res.redirect('/buyer/video-feed');
    }
    
    // Increment view count
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
        { book: video.book },
        { tags: { $in: video.tags || [] } }
      ]
    })
    .limit(5)
    .populate('user', 'name avatar');
    
    res.render('buyer/video-watch', {
      title: video.title + ' - Bookish Video',
      video,
      comments: comments || [],
      relatedVideos: relatedVideos || [],
      user: req.user,
      req: req
    });
  } catch (err) {
    console.error('Error watching video:', err);
    req.flash('error_msg', 'Error loading video');
    res.redirect('/buyer/video-feed');
  }
});

/**
 * @route   POST /buyer/video-feed/like/:id
 * @desc    Like/unlike a video
 * @access  Private (Buyer)
 */
router.post('/video-feed/like/:id', ensureAuthenticated, async (req, res) => {
  try {
    const videoId = req.params.id;
    const userId = req.user._id;
    
    const video = await BookVideo.findById(videoId);
    
    if (!video) {
      return res.status(404).json({ success: false, message: 'Video not found' });
    }
    
    // Check if already liked
    const likeIndex = video.likes.findIndex(id => id.toString() === userId.toString());
    
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

/**
 * @route   POST /buyer/video-feed/comment/:id
 * @desc    Add a comment to a video
 * @access  Private (Buyer)
 */
router.post('/video-feed/comment/:id', ensureAuthenticated, async (req, res) => {
  try {
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
    
    return res.json({
      success: true,
      comment: newComment
    });
  } catch (err) {
    console.error('Error adding comment:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * @route   POST /buyer/video-feed/delete/:id
 * @desc    Delete a video (only for video owner)
 * @access  Private (Video Owner)
 */
router.post('/video-feed/delete/:id', ensureAuthenticated, async (req, res) => {
  try {
    const videoId = req.params.id;
    
    // Find the video
    const video = await BookVideo.findById(videoId);
    
    if (!video) {
      req.flash('error_msg', 'Video not found');
      return res.redirect('/buyer/video-feed');
    }
    
    // Check if user is the owner of the video
    if (video.user.toString() !== req.user._id.toString()) {
      req.flash('error_msg', 'You are not authorized to delete this video');
      return res.redirect(`/buyer/video-feed/watch/${videoId}`);
    }
    
    // Get video file path to delete from filesystem
    const videoPath = video.videoUrl;
    const fullVideoPath = path.join(__dirname, '../public', videoPath);
    
    // Delete related comments
    await VideoComment.deleteMany({ video: videoId });
    
    // Delete the video document
    await BookVideo.findByIdAndDelete(videoId);
    
    // Try to delete the video file (wrapped in try-catch to continue if file deletion fails)
    try {
      if (fs.existsSync(fullVideoPath)) {
        fs.unlinkSync(fullVideoPath);
      }
    } catch (fileErr) {
      console.error('Error deleting video file:', fileErr);
      // Continue with redirect even if file deletion fails
    }
    
    req.flash('success_msg', 'Video deleted successfully');
    res.redirect('/buyer/video-feed');
  } catch (err) {
    console.error('Error deleting video:', err);
    req.flash('error_msg', 'Error deleting video');
    res.redirect('/buyer/video-feed');
  }
});

// If you track the cart in session
router.get("/api/cart/count", (req, res) => {
  const cart = req.session.cart || [];
  return res.json({ count: cart.length });
});

// Configure multer for avatar uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = 'public/img/users';
    if (!fs.existsSync(dir)){
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'avatar-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit
  fileFilter: function (req, file, cb) {
    const filetypes = /jpeg|jpg|png|gif/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only image files (jpg, jpeg, png, gif) are allowed!'));
  }
});

/**
 * @route   GET /buyer/profile
 * @desc    Display user profile page
 * @access  Private
 */
router.get("/profile", ensureAuthenticated, async (req, res) => {
  try {
    // Get recent orders
    const orders = await Order.find({ user: req.user._id })
      .sort({ orderDate: -1 })
      .limit(5);
    
    res.render("buyer/profile", {
      title: "My Profile - Bookish",
      user: req.user,
      orders: orders,
    });
  } catch (err) {
    console.error(err);
    req.flash("error_msg", "Error loading profile");
    res.redirect("/buyer/browse");
  }
});

/**
 * @route   GET /buyer/profile/edit
 * @desc    Display edit profile form
 * @access  Private
 */
router.get("/profile/edit", ensureAuthenticated, (req, res) => {
  res.render("buyer/profile-edit", {
    title: "Edit Profile - Bookish",
    user: req.user,
  });
});

/**
 * @route   POST /buyer/profile/update
 * @desc    Update user profile
 * @access  Private
 */
router.post("/profile/update", ensureAuthenticated, upload.single('avatar'), async (req, res) => {
  try {
    const { name, phone, currentPassword, newPassword, confirmPassword } = req.body;
    const userId = req.user._id;
    
    // Prepare update object
    const updateData = { name, phone };
    
    // If avatar was uploaded, add to update data
    if (req.file) {
      // Delete old avatar if it's not the default
      if (req.user.avatar && req.user.avatar !== '/img/users/default-avatar.jpg') {
        const oldAvatarPath = path.join(__dirname, '../public', req.user.avatar);
        if (fs.existsSync(oldAvatarPath)) {
          fs.unlinkSync(oldAvatarPath);
        }
      }
      
      updateData.avatar = `/img/users/${req.file.filename}`;
    }
    
    // Check if password change was requested
    if (currentPassword && newPassword) {
      // Verify passwords match
      if (newPassword !== confirmPassword) {
        req.flash("error_msg", "New passwords do not match");
        return res.redirect("/buyer/profile/edit");
      }
      
      // Get user with password
      const user = await User.findById(userId).select('+password');
      
      // Check if current password is correct
      const isMatch = await user.matchPassword(currentPassword);
      if (!isMatch) {
        req.flash("error_msg", "Current password is incorrect");
        return res.redirect("/buyer/profile/edit");
      }
      
      // Hash new password before setting
      const salt = await bcrypt.genSalt(10);
      updateData.password = await bcrypt.hash(newPassword, salt);
    }
    
    // Update user
    await User.findByIdAndUpdate(userId, updateData, { new: true });
    
    req.flash("success_msg", "Profile updated successfully");
    res.redirect("/buyer/profile");
  } catch (err) {
    console.error(err);
    req.flash("error_msg", "Error updating profile");
    res.redirect("/buyer/profile/edit");
  }
});

/**
 * @route   GET /buyer/profile/addresses
 * @desc    Display user addresses
 * @access  Private
 */
router.get("/profile/addresses", ensureAuthenticated, async (req, res) => {
  try {
    // Add this line to capture the redirect query parameter
    const redirect = req.query.redirect || '';
    
    const addresses = await Address.find({ user: req.user._id }).sort({ isDefault: -1 });
    
    res.render("buyer/addresses", {
      title: "My Addresses - Bookish",
      user: req.user,
      addresses: addresses,
      redirect: redirect  // Pass the redirect parameter to the template
    });
  } catch (err) {
    console.error(err);
    req.flash("error_msg", "Error loading addresses");
    res.redirect("/buyer/profile");
  }
});

/**
 * @route   GET /buyer/profile/addresses/add
 * @desc    Display add address form
 * @access  Private
 */
router.get("/profile/addresses/add", ensureAuthenticated, (req, res) => {
  const redirect = req.query.redirect || '';
  
  res.render("buyer/address-form", {
    title: "Add Address - Bookish",
    user: req.user,
    address: null,
    redirect: redirect
  });
});

/**
 * @route   GET /buyer/profile/addresses/edit/:id
 * @desc    Display edit address form
 * @access  Private
 */
router.get("/profile/addresses/edit/:id", ensureAuthenticated, async (req, res) => {
  try {
    const redirect = req.query.redirect || ''; // Add this line to capture redirect parameter
    
    const address = await Address.findOne({ 
      _id: req.params.id, 
      user: req.user._id 
    });
    
    if (!address) {
      req.flash("error_msg", "Address not found");
      return res.redirect("/buyer/profile/addresses");
    }
    
    res.render("buyer/address-form", {
      title: "Edit Address - Bookish",
      user: req.user,
      address: address,
      redirect: redirect // Add this line to pass redirect to template
    });
  } catch (err) {
    console.error(err);
    req.flash("error_msg", "Error loading address");
    res.redirect("/buyer/profile/addresses");
  }
});

/**
 * @route   POST /buyer/profile/addresses/create
 * @desc    Create new address
 * @access  Private
 */
router.post("/profile/addresses/create", ensureAuthenticated, async (req, res) => {
  try {
    const { name, phone, street, city, state, zipCode, isDefault, redirect } = req.body;
    
    const newAddress = new Address({
      user: req.user._id,
      name,
      phone,
      street,
      city,
      state,
      zipCode,
      country: "India",
      isDefault: isDefault === "on",
    });
    
    // If this is marked as default, unmark other addresses
    if (newAddress.isDefault) {
      await Address.updateMany(
        { user: req.user._id, isDefault: true },
        { isDefault: false }
      );
      
      // Also update the user's default address
      await User.findByIdAndUpdate(req.user._id, {
        address: {
          street,
          city,
          state,
          zipCode,
          country: "India"
        },
        phone
      });
    }
    
    await newAddress.save();
    
    req.flash("success_msg", "Address added successfully");
    
    // Check if we should redirect back to checkout
    if (redirect === 'checkout') {
      return res.redirect("/buyer/checkout");
    }
    
    res.redirect("/buyer/profile/addresses");
  } catch (err) {
    console.error(err);
    req.flash("error_msg", "Error adding address");
    res.redirect("/buyer/profile/addresses/add");
  }
});

/**
 * @route   POST /buyer/profile/addresses/update/:id
 * @desc    Update address
 * @access  Private
 */
router.post("/profile/addresses/update/:id", ensureAuthenticated, async (req, res) => {
  try {
    const { name, phone, street, city, state, zipCode, isDefault, redirect } = req.body;
    
    const address = await Address.findOne({
      _id: req.params.id,
      user: req.user._id
    });
    
    if (!address) {
      req.flash("error_msg", "Address not found");
      return res.redirect("/buyer/profile/addresses");
    }
    
    address.name = name;
    address.phone = phone;
    address.street = street;
    address.city = city;
    address.state = state;
    address.zipCode = zipCode;
    address.isDefault = isDefault === "on";
    
    // If this is marked as default, unmark other addresses
    if (address.isDefault) {
      await Address.updateMany(
        { user: req.user._id, _id: { $ne: address._id }, isDefault: true },
        { isDefault: false }
      );
      
      // Also update the user's default address
      await User.findByIdAndUpdate(req.user._id, {
        address: {
          street,
          city,
          state,
          zipCode,
          country: "India"
        },
        phone
      });
    }
    
    await address.save();
    
    req.flash("success_msg", "Address updated successfully");
    
    // Check if we should redirect back to checkout - ADD THIS SECTION
    if (redirect === 'checkout') {
      return res.redirect("/buyer/checkout");
    }
    
    res.redirect("/buyer/profile/addresses");
  } catch (err) {
    console.error(err);
    req.flash("error_msg", "Error updating address");
    res.redirect("/buyer/profile/addresses");
  }
});

/**
 * @route   POST /buyer/profile/addresses/set-default/:id
 * @desc    Set address as default
 * @access  Private
 */
router.post("/profile/addresses/set-default/:id", ensureAuthenticated, async (req, res) => {
  try {
    const { redirect } = req.body; // Add this line
    const address = await Address.findOne({
      _id: req.params.id,
      user: req.user._id
    });
    
    if (!address) {
      req.flash("error_msg", "Address not found");
      return res.redirect("/buyer/profile/addresses");
    }
    
    // Unmark all addresses as default
    await Address.updateMany(
      { user: req.user._id },
      { isDefault: false }
    );
    
    // Mark this address as default
    address.isDefault = true;
    await address.save();
    
    // Update user's default address
    await User.findByIdAndUpdate(req.user._id, {
      address: {
        street: address.street,
        city: address.city,
        state: address.state,
        zipCode: address.zipCode,
        country: address.country
      },
      phone: address.phone
    });
    
    req.flash("success_msg", "Default address updated");
    
    // Check if we should redirect back to checkout - ADD THIS SECTION
    if (redirect === 'checkout') {
      return res.redirect("/buyer/checkout");
    }
    
    res.redirect("/buyer/profile/addresses");
  } catch (err) {
    console.error(err);
    req.flash("error_msg", "Error updating default address");
    res.redirect("/buyer/profile/addresses");
  }
});

/**
 * @route   POST /buyer/profile/addresses/delete/:id
 * @desc    Delete address
 * @access  Private
 */
router.post("/profile/addresses/delete/:id", ensureAuthenticated, async (req, res) => {
  try {
    const address = await Address.findOne({
      _id: req.params.id,
      user: req.user._id
    });
    
    if (!address) {
      req.flash("error_msg", "Address not found");
      return res.redirect("/buyer/profile/addresses");
    }
    
    // Don't allow deletion of default address
    if (address.isDefault) {
      req.flash("error_msg", "Cannot delete default address");
      return res.redirect("/buyer/profile/addresses");
    }
    
    // Replace address.remove() with findByIdAndDelete
    await Address.findByIdAndDelete(address._id);
    
    req.flash("success_msg", "Address deleted successfully");
    res.redirect("/buyer/profile/addresses");
  } catch (err) {
    console.error(err);
    req.flash("error_msg", "Error deleting address");
    res.redirect("/buyer/profile/addresses");
  }
});

/**
 * @route   GET /buyer/register-complaint
 * @desc    Display complaint registration form
 * @access  Private (Buyer)
 */
router.get("/register-complaint", ensureAuthenticated, ensureBuyer, async (req, res) => {
  try {
    // Get user's previous complaints
    const complaints = await Complaint.find({ user: req.user._id }).sort({ createdAt: -1 });
    
    res.render("buyer/register-complaint", {
      title: "Register Complaint - Bookish",
      user: req.user,
      complaints: complaints
    });
  } catch (err) {
    console.error(err);
    req.flash("error_msg", "Error loading complaints page");
    res.redirect("/buyer/browse");
  }
});

/**
 * @route   POST /buyer/register-complaint
 * @desc    Submit a new complaint
 * @access  Private (Buyer)
 */
router.post("/register-complaint", ensureAuthenticated, ensureBuyer, async (req, res) => {
  try {
    const { subject, description } = req.body;
    
    // Create new complaint
    const newComplaint = new Complaint({
      subject,
      description,
      user: req.user._id,
      userRole: 'buyer'
    });
    
    await newComplaint.save();
    
    req.flash("success_msg", "Complaint submitted successfully");
    res.redirect("/buyer/register-complaint");
  } catch (err) {
    console.error(err);
    req.flash("error_msg", "Error submitting complaint");
    res.redirect("/buyer/register-complaint");
  }
});

/**
 * @route   GET /buyer/orders
 * @desc    Show all orders for the buyer
 * @access  Private (Buyer)
 */
router.get("/orders", ensureAuthenticated, ensureBuyer, async (req, res) => {
  try {
    const orders = await Order.find({ buyer: req.user._id })
      .populate('items.book', 'title author coverImage')
      .populate('items.seller', 'name email')
      .sort({ orderDate: -1 });
    
    res.render("buyer/orders", {
      title: "My Orders - Bookish",
      user: req.user,
      orders: orders
    });
  } catch (err) {
    console.error(err);
    req.flash("error_msg", "Error loading orders");
    res.redirect("/buyer/profile");
  }
});

/**
 * @route   GET /buyer/orders/:id
 * @desc    Show order details for a specific order
 * @access  Private (Buyer)
 */
router.get("/orders/:id", ensureAuthenticated, ensureBuyer, async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      buyer: req.user._id
    })
    .populate('items.book', 'title author coverImage')
    .populate('items.seller', 'name email');
    
    if (!order) {
      req.flash("error_msg", "Order not found");
      return res.redirect("/buyer/orders");
    }
    
    res.render("buyer/order-details", {
      title: "Order Details - Bookish",
      user: req.user,
      order: order
    });
  } catch (err) {
    console.error(err);
    req.flash("error_msg", "Error loading order details");
    res.redirect("/buyer/orders");
  }
});

module.exports = router

