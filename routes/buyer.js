/**
 * Buyer routes for browsing books, managing cart, and viewing library
 */

const express = require("express")
const router = express.Router()
const Book = require("../models/Book")
const Cart = require("../models/Cart")
const Order = require("../models/Order")
const { ensureAuthenticated, ensureBuyer } = require("../middleware/auth")

/**
 * @route   GET /buyer/browse
 * @desc    Browse books with search and filter
 * @access  Private (Buyer)
 */
router.get("/browse", ensureAuthenticated, ensureBuyer, async (req, res) => {
  try {
    const { search, genre, condition, minPrice, maxPrice, sort } = req.query

    // Build query
    const query = { isApproved: true, isAvailable: true }

    if (search) {
      query.$text = { $search: search }
    }

    if (genre) {
      query.genres = genre
    }

    if (condition) {
      query.condition = condition
    }

    // Price range
    if (minPrice || maxPrice) {
      query.price = {}
      if (minPrice) query.price.$gte = Number(minPrice)
      if (maxPrice) query.price.$lte = Number(maxPrice)
    }

    // Sort options
    let sortOption = {}
    if (sort === "price-asc") {
      sortOption = { price: 1 }
    } else if (sort === "price-desc") {
      sortOption = { price: -1 }
    } else if (sort === "newest") {
      sortOption = { createdAt: -1 }
    } else if (sort === "rating") {
      sortOption = { rating: -1 }
    } else {
      // Default sort
      sortOption = { createdAt: -1 }
    }

    // Get all genres for filter
    const genres = await Book.distinct("genres")

    // Fetch books
    const books = await Book.find(query).sort(sortOption).populate("seller", "name").populate("originalOwner", "name")

    res.render("buyer/browse", {
      title: "Browse Books - Bookish",
      books,
      genres,
      filters: {
        search,
        genre,
        condition,
        minPrice,
        maxPrice,
        sort,
      },
      user: req.user,
    })
  } catch (err) {
    console.error(err)
    req.flash("error_msg", "Error fetching books")
    res.redirect("/")
  }
})

/**
 * @route   GET /buyer/book/:id
 * @desc    View book details
 * @access  Private (Buyer)
 */
router.get("/book/:id", ensureAuthenticated, ensureBuyer, async (req, res) => {
  try {
    const book = await Book.findById(req.params.id).populate("seller", "name").populate("originalOwner", "name")

    if (!book) {
      req.flash("error_msg", "Book not found")
      return res.redirect("/buyer/browse");
    }

    // Get recommended books based on genre
    const recommendedBooks = await Book.find({
      _id: { $ne: book._id },
      genres: { $in: book.genres },
      isApproved: true,
      isAvailable: true,
    })
      .limit(4)
      .populate("seller", "name")

    res.render("buyer/book-details", {
      title: `${book.title} - Bookish`,
      book,
      recommendedBooks,
      user: req.user,
    })
  } catch (err) {
    console.error(err)
    req.flash("error_msg", "Error fetching book details")
    res.redirect("/buyer/browse")
  }
})

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
 * @route   GET /buyer/library
 * @desc    View purchased books
 * @access  Private (Buyer)
 */
router.get("/library", ensureAuthenticated, ensureBuyer, async (req, res) => {
  try {
    // Get all completed orders
    const orders = await Order.find({
      user: req.user._id,
      orderStatus: "delivered",
    }).sort({ orderDate: -1 })

    // Extract unique books from orders
    const purchasedBooks = []
    const bookIds = new Set()

    orders.forEach((order) => {
      order.items.forEach((item) => {
        if (!bookIds.has(item.book.toString())) {
          bookIds.add(item.book.toString())
          purchasedBooks.push({
            _id: item.book,
            title: item.title,
            author: item.author,
            coverImage: item.coverImage,
            purchaseDate: order.orderDate,
            // Placeholder for reading progress
            progress: Math.floor(Math.random() * 100),
          })
        }
      })
    })

    res.render("buyer/library", {
      title: "Your Library - Bookish",
      books: purchasedBooks,
      user: req.user,
    })
  } catch (err) {
    console.error(err)
    req.flash("error_msg", "Error fetching library")
    res.redirect("/")
  }
})

/**
 * @route   GET /buyer/video-feed
 * @desc    View video feed
 * @access  Private (Buyer)
 */
router.get("/video-feed", ensureAuthenticated, ensureBuyer, (req, res) => {
  // Mock video data
  const videos = [
    {
      id: 1,
      title: 'Why You Should Read "Atomic Habits"',
      author: "BookTuber1",
      thumbnail: "/img/videos/video1.jpg",
      url: "https://example.com/video1",
      likes: 1245,
      comments: 89,
    },
    {
      id: 2,
      title: "Monthly Book Haul - Fantasy Edition",
      author: "BookTuber2",
      thumbnail: "/img/videos/video2.jpg",
      url: "https://example.com/video2",
      likes: 876,
      comments: 54,
    },
    {
      id: 3,
      title: "Review: The Silent Patient",
      author: "BookTuber3",
      thumbnail: "/img/videos/video3.jpg",
      url: "https://example.com/video3",
      likes: 2345,
      comments: 132,
    },
    {
      id: 4,
      title: "5 Books That Changed My Life",
      author: "BookTuber4",
      thumbnail: "/img/videos/video4.jpg",
      url: "https://example.com/video4",
      likes: 5678,
      comments: 321,
    },
    {
      id: 5,
      title: "How to Read More Books",
      author: "BookTuber5",
      thumbnail: "/img/videos/video5.jpg",
      url: "https://example.com/video5",
      likes: 987,
      comments: 76,
    },
  ]

  res.render("buyer/video-feed", {
    title: "Video Feed - Bookish",
    videos,
    user: req.user,
  })
})


// routes/buyer.js


// If you track the cart in session
router.get("/api/cart/count", (req, res) => {
  const cart = req.session.cart || [];
  return res.json({ count: cart.length });
});

module.exports = router

