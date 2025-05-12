/**
 * Public routes for home page, about, and pricing
 */

const express = require("express")
const router = express.Router()
const Book = require("../models/Book")
const Complaint = require("../models/Complaint")
const Blog = require("../models/Blog")
const RecommendationList = require("../models/RecommendationList")
const { ensureAuthenticated } = require("../middleware/auth")

/**
 * @route   GET /
 * @desc    Home page
 * @access  Public
 */
router.get("/", async (req, res) => {
  try {
    // Get featured books
    const featuredBooks = await Book.find({ isApproved: true, isAvailable: true }).sort({ rating: -1 }).limit(8)

    // Get new arrivals
    const newArrivals = await Book.find({ isApproved: true, isAvailable: true }).sort({ createdAt: -1 }).limit(8)

    // Get trending books (based on review count)
    const trendingBooks = await Book.find({ isApproved: true, isAvailable: true }).sort({ reviewCount: -1 }).limit(8)

    // Get latest blog posts
    const latestBlogs = await Blog.find()
      .populate('author', 'name avatar')
      .sort({ createdAt: -1 })
      .limit(3)

    // Get top recommendation lists
    const topLists = await RecommendationList.find({ isPublic: true })
      .populate('creator', 'name avatar')
      .populate('books')
      .sort({ upvotes: -1 })
      .limit(3)

    res.render("home", {
      title: "BOOKSHELF - Where Books Meet Community",
      featuredBooks,
      newArrivals,
      trendingBooks,
      latestBlogs,
      topLists,
      user: req.user,
    })
  } catch (err) {
    console.error(err)
    res.status(500).render("errors/500")
  }
})

/**
 * @route   GET /about
 * @desc    About page
 * @access  Public
 */
router.get("/about", (req, res) => {
  res.render("about", {
    title: "About Us - BOOKSHELF",
    user: req.user,
  })
})

/**
 * @route   GET /pricing
 * @desc    Revenue model and pricing page
 * @access  Public
 */
router.get("/pricing", (req, res) => {
  // Define pricing plans
  const plans = [
    {
      name: "Free",
      price: 0,
      features: ["Browse all books", "Purchase physical books", "Basic recommendation system", "Standard delivery"],
    },
    {
      name: "Premium",
      price: 199,
      period: "month",
      features: [
        "All Free features",
        "Access to e-books and audiobooks",
        "Advanced recommendation system",
        "Priority delivery",
        "Exclusive discounts",
      ],
    },
    {
      name: "Premium Plus",
      price: 499,
      period: "month",
      features: [
        "All Premium features",
        "Unlimited e-book access",
        "Monthly free physical book",
        "Free express delivery",
        "Early access to new releases",
      ],
    },
  ]

  // Define seller fees
  const sellerFees = [
    {
      name: "Basic Seller",
      fee: "10%",
      features: ["List up to 50 books", "Standard visibility", "Basic analytics"],
    },
    {
      name: "Professional Seller",
      fee: "8%",
      monthlyFee: 499,
      features: ["Unlimited book listings", "Enhanced visibility", "Advanced analytics", "Priority support"],
    },
  ]

  res.render("pricing", {
    title: "Pricing - BOOKSHELF",
    plans,
    sellerFees,
    user: req.user,
  })
})

/**
 * @route   GET /contact
 * @desc    Contact page
 * @access  Public
 */
router.get("/contact", (req, res) => {
  res.render("contact", {
    title: "Contact Us - BOOKSHELF",
    user: req.user,
  })
})

/**
 * @route   POST /contact/submit
 * @desc    Process contact form submission and create complaint entry
 * @access  Public
 */
router.post("/contact/submit", async (req, res) => {
  try {
    const { name, email, subject, message, type } = req.body

    // Create a complaint record for all contact form submissions
    let newComplaint

    if (req.isAuthenticated()) {
      // For logged-in users
      newComplaint = new Complaint({
        subject: subject,
        description: message,
        user: req.user._id,
        userRole: req.user.role,
        status: "pending",
        source: "contact_form",
      })
    } else {
      // For guest users
      newComplaint = new Complaint({
        subject: subject,
        description: message,
        guestInfo: {
          name: name,
          email: email,
        },
        userRole: "guest",
        status: "pending",
        source: "contact_form",
      })
    }

    await newComplaint.save()

    // You may also want to send an email notification to admin
    // sendEmailNotification('admin@example.com', 'New Contact Form Submission', {...});

    req.flash("success_msg", "Your message has been sent. We will get back to you soon.")
    res.redirect("/contact")
  } catch (err) {
    console.error("Error submitting contact form:", err)
    req.flash("error_msg", "There was an error submitting your message. Please try again.")
    res.redirect("/contact")
  }
})

/**
 * @route   GET /browse
 * @desc    Browse books with search and filter
 * @access  Public (Authenticated)
 */
router.get("/browse", ensureAuthenticated, async (req, res) => {
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

    // Price range filtering using $or to handle discount price
    if (minPrice || maxPrice) {
      const priceQuery = []

      // Books with no discount (use price field)
      const regularPriceQuery = { discountPrice: { $exists: false } }
      if (minPrice) regularPriceQuery.price = { $gte: Number(minPrice) }
      if (maxPrice) regularPriceQuery.price = { ...regularPriceQuery.price, $lte: Number(maxPrice) }

      // Books with discount (use discountPrice field)
      const discountPriceQuery = { discountPrice: { $exists: true } }
      if (minPrice) discountPriceQuery.discountPrice = { $gte: Number(minPrice) }
      if (maxPrice) discountPriceQuery.discountPrice = { ...discountPriceQuery.discountPrice, $lte: Number(maxPrice) }

      priceQuery.push(regularPriceQuery, discountPriceQuery)
      query.$or = priceQuery
    }

    // Get all genres for filter
    const genres = await Book.distinct("genres")

    // Prepare the aggregation pipeline for sorting by effective price if needed
    let books = []

    if (sort === "price-asc" || sort === "price-desc") {
      // For price sorting, we need to use aggregation to sort by effective price
      const sortOrder = sort === "price-asc" ? 1 : -1

      // Create aggregation pipeline
      const pipeline = [
        { $match: query },
        {
          $addFields: {
            effectivePrice: { $ifNull: ["$discountPrice", "$price"] }
          }
        },
        { $sort: { effectivePrice: sortOrder } },
        {
          $lookup: {
            from: "users",
            localField: "seller",
            foreignField: "_id",
            as: "seller"
          }
        },
        {
          $lookup: {
            from: "users",
            localField: "originalOwner",
            foreignField: "_id",
            as: "originalOwner"
          }
        },
        {
          $unwind: {
            path: "$seller",
            preserveNullAndEmptyArrays: true
          }
        },
        {
          $unwind: {
            path: "$originalOwner",
            preserveNullAndEmptyArrays: true
          }
        }
      ]

      books = await Book.aggregate(pipeline)
    } else {
      // Standard sorting options
      let sortOption = {}
      if (sort === "newest") {
        sortOption = { createdAt: -1 }
      } else if (sort === "rating") {
        sortOption = { rating: -1 }
      } else {
        // Default sort
        sortOption = { createdAt: -1 }
      }

      // Use normal find with populate for other sort options
      books = await Book.find(query)
        .sort(sortOption)
        .populate("seller", "name")
        .populate("originalOwner", "name")
    }

    res.render("public/browse", {
      title: "Browse Books - BOOKSHELF",
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
 * @route   GET /book/:id
 * @desc    View book details
 * @access  Public
 */
router.get("/book/:id", ensureAuthenticated, async (req, res) => {
  try {
    const book = await Book.findById(req.params.id)
      .populate("seller", "name")
      .populate("originalOwner", "name")

    if (!book) {
      req.flash("error_msg", "Book not found")
      return res.redirect("/browse")
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

    res.render("public/book-details", {
      title: `${book.title} - BOOKSHELF`,
      book,
      recommendedBooks,
      user: req.user,
    })
  } catch (err) {
    console.error(err)
    req.flash("error_msg", "Error fetching book details")
    res.redirect("/browse")
  }
})

module.exports = router

