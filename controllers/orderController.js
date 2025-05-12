const Order = require('../models/Order');
const asyncHandler = require('../middleware/async');
const ErrorResponse = require('../utils/errorResponse');

// @desc    Create new order
// @route   POST /api/orders
// @access  Private (Buyer)
exports.createOrder = asyncHandler(async (req, res, next) => {
  const { items, shippingAddress, paymentMethod } = req.body;

  // Calculate total amount
  const totalAmount = items.reduce((total, item) => total + (item.price * item.quantity), 0);

  const order = await Order.create({
    buyer: req.user.id,
    items,
    totalAmount,
    shippingAddress,
    paymentMethod
  });

  res.status(201).json({
    success: true,
    data: order
  });
});

// @desc    Get all orders for logged in user (Buyer)
// @route   GET /api/orders/my-orders
// @access  Private (Buyer)
exports.getMyOrders = asyncHandler(async (req, res, next) => {
  const orders = await Order.find({ buyer: req.user.id })
    .populate('items.book', 'title author coverImage')
    .populate('items.seller', 'name email');

  res.status(200).json({
    success: true,
    count: orders.length,
    data: orders
  });
});

// @desc    Get all orders for logged in seller
// @route   GET /api/orders/seller-orders
// @access  Private (Seller)
exports.getSellerOrders = asyncHandler(async (req, res, next) => {
  const orders = await Order.find({ 'items.seller': req.user.id })
    .populate('buyer', 'name email')
    .populate('items.book', 'title author coverImage');

  res.status(200).json({
    success: true,
    count: orders.length,
    data: orders
  });
});

// @desc    Get all orders (Admin)
// @route   GET /api/orders
// @access  Private (Admin)
exports.getAllOrders = asyncHandler(async (req, res, next) => {
  const orders = await Order.find()
    .populate('buyer', 'name email')
    .populate('items.seller', 'name email')
    .populate('items.book', 'title author coverImage');

  res.status(200).json({
    success: true,
    count: orders.length,
    data: orders
  });
});

// @desc    Get single order
// @route   GET /api/orders/:id
// @access  Private
exports.getOrder = asyncHandler(async (req, res, next) => {
  const order = await Order.findById(req.params.id)
    .populate('buyer', 'name email')
    .populate('items.seller', 'name email')
    .populate('items.book', 'title author coverImage');

  if (!order) {
    return next(new ErrorResponse(Order not found with id of ${req.params.id}, 404));
  }

  // Check if user is authorized to view this order
  if (req.user.role !== 'admin' && 
      order.buyer.toString() !== req.user.id && 
      !order.items.some(item => item.seller.toString() === req.user.id)) {
    return next(new ErrorResponse('Not authorized to access this order', 403));
  }

  res.status(200).json({
    success: true,
    data: order
  });
});

// @desc    Update order status
// @route   PUT /api/orders/:id/status
// @access  Private (Seller/Admin)
exports.updateOrderStatus = asyncHandler(async (req, res, next) => {
  const { orderStatus, trackingNumber, deliveryDate } = req.body;

  const order = await Order.findById(req.params.id);

  if (!order) {
    return next(new ErrorResponse(Order not found with id of ${req.params.id}, 404));
  }

  // Check if user is authorized to update this order
  if (req.user.role !== 'admin' && 
      !order.items.some(item => item.seller.toString() === req.user.id)) {
    return next(new ErrorResponse('Not authorized to update this order', 403));
  }

  // Update order status
  order.orderStatus = orderStatus;
  if (trackingNumber) order.trackingNumber = trackingNumber;
  if (deliveryDate) order.deliveryDate = deliveryDate;
  order.lastStatusUpdate = Date.now();

  await order.save();

  res.status(200).json({
    success: true,
    data: order
  });
});