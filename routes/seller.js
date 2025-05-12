/**
 * Seller routes for managing book inventory and sales
 */

const express = require("express")
const router = express.Router()
const Book = require("../models/Book")
const Order = require("../models/Order")
const Complaint = require('../models/Complaint');
const { ensureAuthenticated, ensureSeller } = require("../middleware/auth")

/**
 * @route   GET /seller/dashboard
 * @desc    Seller dashboard with sales analytics 
 * @access  Private (Seller)
 */
router.get("/dashboard", ensureAuthenticated, ensureSeller, async (req, res) => {
  try {
    // Get seller's books
    const books = await Book.find({ seller: req.user._id });

    // Get orders containing seller's books
    const orders = await Order.find({
      'items.seller': req.user._id,
      orderStatus: { $in: ["processing", "shipped", "delivered"] }
    })
    .populate('buyer', 'name email')
    .populate('items.book', 'title author coverImage')
    .sort({ orderDate: -1 });

    // Calculate total sales
    let totalSales = 0;
    let monthlySales = 0;
    const totalOrders = orders.length;
    let pendingOrders = 0;

    // Current month
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Initialize sales data for each month
    const salesData = Array(12).fill().map((_, i) => ({
      month: new Date(0, i).toLocaleString('default', { month: 'short' }),
      sales: 0
    }));

    orders.forEach((order) => {
      // Calculate total sales
      order.items.forEach((item) => {
        if (item.seller && item.seller.toString() === req.user._id.toString()) {
          const itemTotal = item.price * item.quantity;
          totalSales += itemTotal;

          // Calculate monthly sales
          const orderDate = new Date(order.orderDate);
          if (orderDate.getMonth() === currentMonth && orderDate.getFullYear() === currentYear) {
            monthlySales += itemTotal;
          }

          // Add to monthly sales data
          salesData[orderDate.getMonth()].sales += itemTotal;
        }
      });

      // Count pending orders
      if (order.orderStatus === "processing") {
        pendingOrders++;
      }
    });

    // Get top selling books
    const topBooks = books.sort((a, b) => b.reviewCount - a.reviewCount).slice(0, 5);

    // Get recent orders
    const recentOrders = orders.slice(0, 5);

    res.render("seller/dashboard", {
      title: "Seller Dashboard - Bookish",
      totalSales,
      monthlySales,
      totalOrders,
      pendingOrders,
      salesData,
      topBooks,
      recentOrders,
      user: req.user,
    });
  } catch (err) {
    console.error(err);
    req.flash("error_msg", "Error loading dashboard");
    res.redirect("/");
  }
});

/**
 * @route   GET /seller/upload
 * @desc    Render book upload form
 * @access  Private (Seller)
 */
router.get("/upload", ensureAuthenticated, ensureSeller, (req, res) => {
  res.render("seller/upload", {
    title: "Upload Book - Bookish",
    user: req.user,
  })
})

/**
 * @route   POST /seller/upload
 * @desc    Upload a new book
 * @access  Private (Seller)
 */
router.post("/upload", ensureAuthenticated, ensureSeller, async (req, res) => {
  try {
    const {
      title,
      author,
      description,
      isbn,
      price,
      discountPrice,
      publisher,
      publishedDate,
      pageCount,
      language,
      genres,
      condition,
      stock,
      format,
      coverImageUrl,
    } = req.body

    // Validate required fields
    if (!title || !author || !description || !isbn || !price || !publisher || !genres || !stock || !format) {
      req.flash("error_msg", "Please fill in all required fields")
      return res.redirect("/seller/upload");
    }

    let finalCoverImage =
      coverImageUrl && coverImageUrl.trim() !== ""
        ? coverImageUrl.trim()
        : "https://nnpdev.wustl.edu/img/BookCovers/genericBookCover.jpg";
        // https://static.wikia.nocookie.net/gijoe/images/b/bf/Default_book_cover.jpg/revision/latest/scale-to-width-down/340?cb=20120719182552

    // Create new book
    const newBook = new Book({
      title,
      author,
      description,
      isbn,
      price,
      discountPrice: discountPrice || price,
      publisher,
      publishedDate,
      pageCount,
      language,
      genres: Array.isArray(genres) ? genres : [genres],
      condition,
      seller: req.user._id,
      stock,
      format,
      // If book is used, set current seller as original owner
      originalOwner: condition === "used" ? req.user._id : null,
      // Default cover image
      coverImage: finalCoverImage,
    })

    await newBook.save()

    req.flash("success_msg", "Book uploaded successfully and pending approval")
    res.redirect("/seller/inventory")
  } catch (err) {
    console.error(err)
    req.flash("error_msg", "Error uploading book")
    res.redirect("/seller/upload")
  }
})

/**
 * @route   GET /seller/inventory
 * @desc    View and manage book inventory
 * @access  Private (Seller)
 */
router.get("/inventory", ensureAuthenticated, ensureSeller, async (req, res) => {
  try {
    const books = await Book.find({ seller: req.user._id }).sort({ createdAt: -1 })

    res.render("seller/inventory", {
      title: "Book Inventory - Bookish",
      books,
      user: req.user,
    })
  } catch (err) {
    console.error(err)
    req.flash("error_msg", "Error fetching inventory")
    res.redirect("/seller/dashboard")
  }
})

/**
 * @route   GET /seller/edit/:id
 * @desc    Edit book form
 * @access  Private (Seller)
 */
router.get("/edit/:id", ensureAuthenticated, ensureSeller, async (req, res) => {
  try {
    const book = await Book.findOne({
      _id: req.params.id,
      seller: req.user._id,
    })

    if (!book) {
      req.flash("error_msg", "Book not found or you are not authorized")
      return res.redirect("/seller/inventory");
    }

    res.render("seller/edit-book", {
      title: "Edit Book - Bookish",
      book,
      user: req.user,
    })
  } catch (err) {
    console.error(err)
    req.flash("error_msg", "Error fetching book")
    res.redirect("/seller/inventory")
  }
})

/**
 * @route   POST /seller/edit/:id
 * @desc    Update book
 * @access  Private (Seller)
 */
router.post("/edit/:id", ensureAuthenticated, ensureSeller, async (req, res) => {
  try {
    const {
      title,
      author,
      description,
      isbn,
      price,
      discountPrice,
      publisher,
      publishedDate,
      pageCount,
      language,
      format,
      stock,
      isAvailable
    } = req.body;

    // Find book
    const book = await Book.findOne({
      _id: req.params.id,
      seller: req.user._id,
    });

    if (!book) {
      req.flash("error_msg", "Book not found or you are not authorized");
      return res.redirect("/seller/inventory");
    }

    // Update book fields
    book.title = title;
    book.author = author;
    book.description = description;
    book.isbn = isbn;
    book.price = price;
    book.discountPrice = discountPrice || price;
    book.publisher = publisher;
    book.publishedDate = publishedDate;
    book.pageCount = pageCount;
    book.language = language;
    book.format = format;
    book.stock = stock;
    book.isAvailable = isAvailable === "on";

    await book.save();

    req.flash("success_msg", "Book updated successfully");
    res.redirect("/seller/inventory");
  } catch (err) {
    console.error(err);
    req.flash("error_msg", "Error updating book");
    res.redirect("/seller/inventory");
  }
});

/**
 * @route   POST /seller/delete/:id
 * @desc    Delete book
 * @access  Private (Seller)
 */
router.post("/delete/:id", ensureAuthenticated, ensureSeller, async (req, res) => {
  try {
    const book = await Book.findOne({
      _id: req.params.id,
      seller: req.user._id,
    })

    if (!book) {
      req.flash("error_msg", "Book not found or you are not authorized")
      return res.redirect("/seller/inventory");
    }

    await book.remove()

    req.flash("success_msg", "Book deleted successfully")
    res.redirect("/seller/inventory")
  } catch (err) {
    console.error(err)
    req.flash("error_msg", "Error deleting book")
    res.redirect("/seller/inventory")
  }
})

/**
 * @route   GET /seller/orders
 * @desc    Get all orders for the seller
 * @access  Private (Seller)
 */
router.get("/orders", ensureAuthenticated, ensureSeller, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    // Build query
    const query = {
      'items.seller': req.user._id
    };

    // Add status filter if provided
    if (req.query.status) {
      query.orderStatus = req.query.status;
    }

    // Get total count for pagination
    const totalOrders = await Order.countDocuments(query);

    // Get orders with pagination
    const orders = await Order.find(query)
      .populate('buyer', 'name email')
      .populate('items.book', 'title author coverImage')
      .sort({ orderDate: -1 })
      .skip(skip)
      .limit(limit);

    // Calculate total sales and monthly sales
    let totalSales = 0;
    let monthlySales = 0;
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    orders.forEach(order => {
      order.items.forEach(item => {
        if (item.seller && item.seller.toString() === req.user._id.toString()) {
          const itemTotal = item.price * item.quantity;
          totalSales += itemTotal;

          const orderDate = new Date(order.orderDate);
          if (orderDate.getMonth() === currentMonth && orderDate.getFullYear() === currentYear) {
            monthlySales += itemTotal;
          }
        }
      });
    });

    // Calculate pending orders
    const pendingOrders = orders.filter(order => order.orderStatus === 'processing').length;

    res.render("seller/orders", {
      title: "Seller Orders - Bookish",
      orders,
      totalSales,
      monthlySales,
      totalOrders,
      pendingOrders,
      currentPage: page,
      totalPages: Math.ceil(totalOrders / limit),
      user: req.user,
      status: req.query.status || 'all'
    });
  } catch (err) {
    console.error(err);
    req.flash("error_msg", "Error loading orders");
    res.redirect("/seller/dashboard");
  }
});

/**
 * @route   GET /seller/orders/:id
 * @desc    Show order details for a specific order
 * @access  Private (Seller)
 */
router.get("/orders/:id", ensureAuthenticated, ensureSeller, async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      'items.seller': req.user._id
    })
    .populate('buyer', 'name email')
    .populate('items.book', 'title author coverImage');
    
    if (!order) {
      req.flash("error_msg", "Order not found");
      return res.redirect("/seller/orders");
    }
    
    // Filter items for this seller only
    const sellerItems = order.items.filter(
      item => item.seller.toString() === req.user._id.toString()
    );
    
    // Calculate total for this seller's items
    const sellerTotal = sellerItems.reduce(
      (total, item) => total + (item.price * item.quantity), 0
    );
    
    res.render("seller/order-details", {
      title: "Order Details - Bookish",
      user: req.user,
      order: order,
      sellerItems: sellerItems,
      sellerTotal: sellerTotal
    });
  } catch (err) {
    console.error(err);
    req.flash("error_msg", "Error loading order details");
    res.redirect("/seller/orders");
  }
});

/**
 * @route   GET /seller/register-complaint
 * @desc    Display complaint registration form
 * @access  Private (Seller)
 */
router.get("/register-complaint", ensureAuthenticated, ensureSeller, async (req, res) => {
  try {
    // Get user's previous complaints
    const complaints = await Complaint.find({ user: req.user._id }).sort({ createdAt: -1 });
    
    res.render("seller/register-complaint", {
      title: "Register Complaint - Bookish",
      user: req.user,
      complaints: complaints
    });
  } catch (err) {
    console.error(err);
    req.flash("error_msg", "Error loading complaints page");
    res.redirect("/seller/dashboard");
  }
});

/**
 * @route   POST /seller/register-complaint
 * @desc    Submit a new complaint
 * @access  Private (Seller)
 */
router.post("/register-complaint", ensureAuthenticated, ensureSeller, async (req, res) => {
  try {
    const { subject, description } = req.body;
    
    // Create new complaint
    const newComplaint = new Complaint({
      subject,
      description,
      user: req.user._id,
      userRole: 'seller'
    });
    
    await newComplaint.save();
    
    req.flash("success_msg", "Complaint submitted successfully");
    res.redirect("/seller/register-complaint");
  } catch (err) {
    console.error(err);
    req.flash("error_msg", "Error submitting complaint");
    res.redirect("/seller/register-complaint");
  }
});

module.exports = router

