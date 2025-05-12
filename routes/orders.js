const express = require('express');
const Order = require('../models/Order');
const {
  createOrder,
  getMyOrders,
  getSellerOrders,
  getAllOrders,
  getOrder,
  updateOrderStatus
} = require('../controllers/orderController');

const { protect, authorize } = require('../middleware/auth');
const { ensureAuthenticated, ensureBuyer } = require('../middleware/auth');

const router = express.Router();

// API Routes
// Buyer routes
router.post('/', protect, authorize('buyer'), createOrder);
router.get('/my-orders', protect, authorize('buyer'), getMyOrders);

// Seller routes
router.get('/seller-orders', protect, authorize('seller'), getSellerOrders);
router.put('/:id/status', protect, authorize('seller', 'admin'), updateOrderStatus);

// Admin routes
router.get('/', protect, authorize('admin'), getAllOrders);

// Common routes (accessible by buyer, seller, and admin)
router.get('/:id', protect, getOrder);

// View Routes
// Buyer view
router.get('/buyer/orders', ensureAuthenticated, ensureBuyer, async (req, res) => {
  try {
    const orders = await Order.find({ buyer: req.user._id })
      .populate('items.book', 'title author coverImage')
      .populate('items.seller', 'name email');
    
    res.render('buyer/orders', { orders });
  } catch (error) {
    console.error(error);
    req.flash('error_msg', 'Error fetching orders');
    res.redirect('/');
  }
});

// Seller view
router.get('/seller/orders', protect, authorize('seller'), async (req, res) => {
  const orders = await Order.find({ 'items.seller': req.user.id })
    .populate('buyer', 'name email')
    .populate('items.book', 'title author coverImage');
  
  res.render('orders/seller-orders', { orders });
});

// Admin view
router.get('/admin/orders', protect, authorize('admin'), async (req, res) => {
  const { status, startDate, endDate } = req.query;
  let query = {};
  
  if (status) {
    query.orderStatus = status;
  }
  
  if (startDate && endDate) {
    query.orderDate = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };
  }
  
  const orders = await Order.find(query)
    .populate('buyer', 'name email')
    .populate('items.seller', 'name email')
    .populate('items.book', 'title author coverImage');
  
  res.render('orders/admin-orders', { orders });
});

/**
 * @route   GET /orders/buyer/order/:id
 * @desc    View order details
 * @access  Private (Buyer)
 */
router.get('/buyer/order/:id', ensureAuthenticated, ensureBuyer, async (req, res) => {
  try {
    console.log('Fetching order details for ID:', req.params.id); // Debug log
    
    const order = await Order.findOne({
      _id: req.params.id,
      buyer: req.user._id
    })
    .populate('items.book', 'title author coverImage')
    .populate('items.seller', 'name email');

    if (!order) {
      console.log('Order not found'); // Debug log
      req.flash('error_msg', 'Order not found');
      return res.redirect('/orders/buyer/orders');
    }

    console.log('Order found:', {
      id: order._id,
      shippingAddress: order.shippingAddress,
      orderDate: order.orderDate,
      deliveryDate: order.deliveryDate
    }); // Debug log

    res.render('buyer/order-details', {
      title: Order #${order.orderId} - Bookish,
      order,
      user: req.user
    });
  } catch (error) {
    console.error('Error fetching order details:', error);
    req.flash('error_msg', 'Error fetching order details');
    res.redirect('/orders/buyer/orders');
  }
});

module.exports = router;