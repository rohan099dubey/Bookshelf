const express = require("express");
const router = express.Router();
const { ensureAuthenticated, ensureBuyer } = require("../middleware/auth");
const Library = require("../models/Library");
const Book = require("../models/Book");
const Subscription = require("../models/Subscription");

/**
 * @route   GET /library
 * @desc    View user's library
 * @access  Private
 */
router.get("/", ensureAuthenticated, async (req, res) => {
  try {
    // Check subscription status
    const subscription = await Subscription.findOne({
      user: req.user._id,
      isActive: true,
      endDate: { $gt: new Date() }
    });
    
    const hasSubscription = !!subscription;
    
    // Get user's library with proper population
    let library = await Library.findOne({ user: req.user._id }).populate({
      path: "items.book",
      select: "title author coverImage format description"
    });
    
    if (!library) {
      library = { items: [] };
    }
    
    res.render("buyer/library", {
      title: "My Library - Bookish",
      user: req.user,
      library: library.items || [],
      hasSubscription,
      subscription
    });
  } catch (err) {
    console.error(err);
    req.flash("error_msg", "Error loading your library");
    res.redirect("/buyer/browse");
  }
});

/**
 * @route   POST /library/add/:bookId
 * @desc    Add a book to user's library with subscription check
 * @access  Private
 */
router.post("/add/:bookId", ensureAuthenticated, ensureBuyer, async (req, res) => {
  try {
    const { bookId } = req.params;
    
    // Check if book exists
    const book = await Book.findById(bookId);
    if (!book) {
      req.flash("error_msg", "Book not found");
      return res.redirect("/buyer/browse");
    }
    
    // Check subscription status
    const subscription = await Subscription.findOne({
      user: req.user._id,
      isActive: true,
      endDate: { $gt: new Date() }
    });
    
    // If no subscription or not premium/premium_plus, redirect to pricing
    if (!subscription || (subscription.plan !== 'premium' && subscription.plan !== 'premium_plus')) {
      req.flash("error_msg", "Upgrade to Premium or Premium Plus to add books to your library");
      req.flash("info_msg", "Get unlimited access to our digital library with a premium subscription");
      return res.redirect("/pricing");
    }
    
    // Check if book is already in library
    let library = await Library.findOne({ user: req.user._id });
    if (!library) {
      library = new Library({ user: req.user._id, items: [] });
    }
    
    const existingItem = library.items.find(item => item.book.toString() === bookId);
    if (existingItem) {
      req.flash("info_msg", "This book is already in your library");
      return res.redirect("/library");
    }
    
    // Add book to library as ebook
    library.items.push({
      book: bookId,
      progress: 0,
      currentPage: 1,
      addedAt: new Date(),
      format: 'ebook' // Ensure it's added as an ebook
    });
    
    await library.save();
    
    // Redirect to the book reader page
    req.flash("success_msg", "Book added to your library successfully");
    res.redirect(`/library/read/${bookId}`);
  } catch (err) {
    console.error(err);
    req.flash("error_msg", "Error adding book to library");
    res.redirect("/buyer/browse");
  }
});

/**
 * @route   GET /library/read/:bookId
 * @desc    Read a book from user's library
 * @access  Private
 */
router.get("/read/:bookId", ensureAuthenticated, async (req, res) => {
  try {
    const bookId = req.params.bookId;
    const userId = req.user._id;
    
    // Find the user's library
    const library = await Library.findOne({ user: userId });
    
    if (!library) {
      req.flash("error_msg", "Library not found");
      return res.redirect("/library");
    }
    
    // Find the book in the library
    const bookItem = library.items.find(item => 
      item.book && item.book.toString() === bookId
    );
    
    if (!bookItem) {
      req.flash("error_msg", "Book not found in your library");
      return res.redirect("/library");
    }
    
    // Get the book details
    const book = await Book.findById(bookId);
    if (!book) {
      req.flash("error_msg", "Book not found");
      return res.redirect("/library");
    }
    
    // Update access count
    bookItem.accessCount = (bookItem.accessCount || 0) + 1;
    bookItem.lastAccessed = Date.now();
    await library.save();
    
    // Add book info needed for the template
    book.isBookmarked = bookItem.isBookmarked || false;
    
    // Always use 10 as the total page count
    book.pageCount = 10;
    
    // Render the book reader with current page and progress
    res.render("buyer/reader", {
      book,
      currentPage: bookItem.currentPage || 1,
      progress: bookItem.progress || 0,
      user: req.user,
      title: `Reading: ${book.title} - Bookish`
    });
  } catch (err) {
    console.error(err);
    req.flash("error_msg", "An error occurred while loading the book");
    res.redirect("/library");
  }
});

/**
 * @route   POST /library/update-progress
 * @desc    Update reading progress for a book
 * @access  Private
 */
router.post("/update-progress", ensureAuthenticated, async (req, res) => {
  try {
    const { bookId, progress, currentPage } = req.body;
    const userId = req.user._id;
    
    // Find user's library
    const library = await Library.findOne({ user: userId });
    if (!library) {
      return res.status(404).json({ success: false, message: "Library not found" });
    }
    
    // Find the book item in the library
    const bookItem = library.items.find(item => 
      item.book && item.book.toString() === bookId
    );
    
    if (!bookItem) {
      return res.status(404).json({ success: false, message: "Book not found in library" });
    }
    
    // Update progress and currentPage if provided
    if (progress !== undefined) {
      bookItem.progress = progress;
    } else if (currentPage !== undefined) {
      // Calculate progress based on 10 pages if only currentPage is provided
      bookItem.progress = Math.round((currentPage / 10) * 100);
    }
    
    if (currentPage !== undefined) {
      bookItem.currentPage = currentPage;
    }
    
    bookItem.lastAccessed = Date.now();
    library.updatedAt = Date.now();
    
    await library.save();
    
    return res.status(200).json({ 
      success: true, 
      progress: bookItem.progress,
      currentPage: bookItem.currentPage
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * @route   POST /library/update-progress/:bookId
 * @desc    Update reading progress for a book (path parameter version)
 * @access  Private
 */
router.post("/update-progress/:bookId", ensureAuthenticated, async (req, res) => {
  try {
    const bookId = req.params.bookId;
    const { progress, currentPage } = req.body;
    const userId = req.user._id;
    
    // Find user's library
    const library = await Library.findOne({ user: userId });
    if (!library) {
      return res.status(404).json({ success: false, message: "Library not found" });
    }
    
    // Find the book item in the library
    const bookItem = library.items.find(item => 
      item.book && item.book.toString() === bookId
    );
    
    if (!bookItem) {
      return res.status(404).json({ success: false, message: "Book not found in library" });
    }
    
    // Update progress and currentPage if provided
    if (progress !== undefined) {
      bookItem.progress = progress;
    } else if (currentPage !== undefined) {
      // Calculate progress based on 10 pages if only currentPage is provided
      bookItem.progress = Math.round((currentPage / 10) * 100);
    }
    
    if (currentPage !== undefined) {
      bookItem.currentPage = currentPage;
    }
    
    bookItem.lastAccessed = Date.now();
    library.updatedAt = Date.now();
    
    await library.save();
    
    return res.status(200).json({ 
      success: true, 
      progress: bookItem.progress,
      currentPage: bookItem.currentPage
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * @route   POST /library/remove/:itemId
 * @desc    Remove a book from user's library
 * @access  Private
 */
router.post("/remove/:itemId", ensureAuthenticated, async (req, res) => {
  try {
    const itemId = req.params.itemId;
    
    // Find user's library
    const library = await Library.findOne({ user: req.user._id });
    
    if (!library) {
      req.flash("error_msg", "Library not found");
      return res.redirect("/buyer/library");
    }
    
    // Find the item in the library
    const itemIndex = library.items.findIndex(item => item._id.toString() === itemId);
    
    if (itemIndex === -1) {
      req.flash("error_msg", "Book not found in your library");
      return res.redirect("/buyer/library");
    }
    
    // Remove the item from the array
    library.items.splice(itemIndex, 1);
    await library.save();
    
    req.flash("success_msg", "Book removed from your library");
    res.redirect("/buyer/library");
  } catch (err) {
    console.error(err);
    req.flash("error_msg", "Error removing book from library");
    res.redirect("/buyer/library");
  }
});

/**
 * @route   GET /library/progress-data
 * @desc    Get progress data for user's library items
 * @access  Private
 */
router.get("/progress-data", ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Find the user's library
    const library = await Library.findOne({ user: userId });
    
    if (!library) {
      return res.status(200).json({ success: true, items: [] });
    }
    
    // Return simplified progress data for each book
    const items = library.items.map(item => ({
      book: item.book.toString(),
      progress: item.progress,
      currentPage: item.currentPage,
      lastAccessed: item.lastAccessed
    }));
    
    return res.status(200).json({ success: true, items });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Add these new routes for bookmark functionality:

/**
 * @route   POST /library/bookmark
 * @desc    Save or remove a bookmark
 * @access  Private
 */
router.post("/bookmark", ensureAuthenticated, async (req, res) => {
  try {
    const { bookId, currentPage, isBookmarked } = req.body;
    const userId = req.user._id;
    
    // Find user's library
    const library = await Library.findOne({ user: userId });
    if (!library) {
      return res.status(404).json({ success: false, message: "Library not found" });
    }
    
    // Find the book in the library
    const bookItem = library.items.find(item => 
      item.book && item.book.toString() === bookId
    );
    
    if (!bookItem) {
      return res.status(404).json({ success: false, message: "Book not found in library" });
    }
    
    // Update bookmark information
    bookItem.isBookmarked = isBookmarked;
    
    if (isBookmarked) {
      bookItem.bookmarkPage = currentPage;
    } else {
      bookItem.bookmarkPage = null;
    }
    
    await library.save();
    
    return res.status(200).json({ success: true, isBookmarked });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * @route   GET /library/is-bookmarked/:bookId
 * @desc    Check if a book is bookmarked
 * @access  Private
 */
router.get("/is-bookmarked/:bookId", ensureAuthenticated, async (req, res) => {
  try {
    const bookId = req.params.bookId;
    const userId = req.user._id;
    
    // Find user's library
    const library = await Library.findOne({ user: userId });
    if (!library) {
      return res.status(200).json({ success: true, isBookmarked: false });
    }
    
    // Find the book in the library
    const bookItem = library.items.find(item => 
      item.book && item.book.toString() === bookId
    );
    
    if (!bookItem) {
      return res.status(200).json({ success: true, isBookmarked: false });
    }
    
    return res.status(200).json({ 
      success: true, 
      isBookmarked: !!bookItem.isBookmarked,
      bookmarkPage: bookItem.bookmarkPage
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;