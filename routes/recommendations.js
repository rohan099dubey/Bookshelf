/**
 * Recommendation List routes
 */

const express = require("express");
const router = express.Router();
const RecommendationList = require("../models/RecommendationList");
const Book = require("../models/Book");
const { ensureAuthenticated } = require("../middleware/auth");

/**
 * @route   GET /recommendations
 * @desc    Get all recommendation lists (paginated and sorted)
 * @access  Public
 */
router.get("/", async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const sort = req.query.sort || "trending"; // Options: trending, newest
        const skip = (page - 1) * limit;

        let sortOption = {};
        if (sort === "trending") {
            sortOption = { upvotes: -1 };
        } else if (sort === "newest") {
            sortOption = { createdAt: -1 };
        }

        const lists = await RecommendationList.find({ isPublic: true })
            .sort(sortOption)
            .skip(skip)
            .limit(limit)
            .populate("creator", "name avatar")
            .populate("books", "title author coverImage");

        const totalLists = await RecommendationList.countDocuments({ isPublic: true });
        const totalPages = Math.ceil(totalLists / limit);

        res.render("recommendations/index", {
            title: "Book Recommendations - Bookish",
            user: req.user,
            lists,
            currentPage: page,
            totalPages,
            sort
        });
    } catch (err) {
        console.error(err);
        req.flash("error_msg", "Failed to fetch recommendation lists");
        res.redirect("/");
    }
});

/**
 * @route   GET /recommendations/my-lists
 * @desc    Get user's recommendation lists
 * @access  Private
 */
router.get("/my-lists", ensureAuthenticated, async (req, res) => {
    try {
        const lists = await RecommendationList.find({ creator: req.user._id })
            .sort({ createdAt: -1 })
            .populate("books", "title author coverImage");

        res.render("recommendations/my-lists", {
            title: "My Recommendation Lists - Bookish",
            user: req.user,
            lists
        });
    } catch (err) {
        console.error(err);
        req.flash("error_msg", "Failed to fetch your recommendation lists");
        res.redirect("/recommendations");
    }
});

/**
 * @route   GET /recommendations/new
 * @desc    Show create recommendation list form
 * @access  Private
 */
router.get("/new", ensureAuthenticated, async (req, res) => {
    try {
        // Get books for selection
        const books = await Book.find().select("title author coverImage");

        res.render("recommendations/new", {
            title: "Create Recommendation List - Bookish",
            user: req.user,
            books
        });
    } catch (err) {
        console.error(err);
        req.flash("error_msg", "Failed to load form");
        res.redirect("/recommendations");
    }
});

/**
 * @route   POST /recommendations
 * @desc    Create a new recommendation list
 * @access  Private
 */
router.post("/", ensureAuthenticated, async (req, res) => {
    try {
        const { title, description, books, isPublic } = req.body;

        // Validate input
        if (!title || !description) {
            req.flash("error_msg", "Please fill in all required fields");
            return res.redirect("/recommendations/new");
        }

        // Create new recommendation list
        const newList = new RecommendationList({
            title,
            description,
            creator: req.user._id,
            books: books || [],
            isPublic: isPublic === "on"
        });

        await newList.save();

        req.flash("success_msg", "Recommendation list created successfully");
        res.redirect("/recommendations/my-lists");
    } catch (err) {
        console.error(err);
        req.flash("error_msg", "Failed to create recommendation list");
        res.redirect("/recommendations/new");
    }
});

/**
 * @route   GET /recommendations/:id
 * @desc    View single recommendation list
 * @access  Public/Private (depends on isPublic flag)
 */
router.get("/:id", async (req, res) => {
    try {
        const list = await RecommendationList.findById(req.params.id)
            .populate("creator", "name avatar")
            .populate("books", "title author coverImage price discountPrice rating");

        if (!list) {
            req.flash("error_msg", "Recommendation list not found");
            return res.redirect("/recommendations");
        }

        // Check if list is private and user is not the creator
        if (!list.isPublic && (!req.user || list.creator._id.toString() !== req.user._id.toString())) {
            req.flash("error_msg", "You do not have permission to view this list");
            return res.redirect("/recommendations");
        }

        res.render("recommendations/show", {
            title: `${list.title} - Bookish`,
            user: req.user,
            list,
            hasUpvoted: req.user ? list.upvotedBy.includes(req.user._id) : false
        });
    } catch (err) {
        console.error(err);
        req.flash("error_msg", "Failed to load recommendation list");
        res.redirect("/recommendations");
    }
});

/**
 * @route   GET /recommendations/:id/edit
 * @desc    Show edit recommendation list form
 * @access  Private
 */
router.get("/:id/edit", ensureAuthenticated, async (req, res) => {
    try {
        const list = await RecommendationList.findById(req.params.id);

        if (!list) {
            req.flash("error_msg", "Recommendation list not found");
            return res.redirect("/recommendations");
        }

        // Check if user is the creator
        if (list.creator.toString() !== req.user._id.toString()) {
            req.flash("error_msg", "Not authorized");
            return res.redirect("/recommendations");
        }

        // Get books for selection
        const books = await Book.find().select("title author coverImage");

        res.render("recommendations/edit", {
            title: "Edit Recommendation List - Bookish",
            user: req.user,
            list,
            books,
            selectedBooks: list.books.map(book => book.toString())
        });
    } catch (err) {
        console.error(err);
        req.flash("error_msg", "Failed to load edit form");
        res.redirect("/recommendations");
    }
});

/**
 * @route   PUT /recommendations/:id
 * @desc    Update recommendation list
 * @access  Private
 */
router.put("/:id", ensureAuthenticated, async (req, res) => {
    try {
        const { title, description, books, isPublic } = req.body;
        const list = await RecommendationList.findById(req.params.id);

        if (!list) {
            req.flash("error_msg", "Recommendation list not found");
            return res.redirect("/recommendations");
        }

        // Check if user is the creator
        if (list.creator.toString() !== req.user._id.toString()) {
            req.flash("error_msg", "Not authorized");
            return res.redirect("/recommendations");
        }

        // Update list
        list.title = title;
        list.description = description;
        list.books = books || [];
        list.isPublic = isPublic === "on";
        list.updatedAt = Date.now();

        await list.save();

        req.flash("success_msg", "Recommendation list updated successfully");
        res.redirect(`/recommendations/${list._id}`);
    } catch (err) {
        console.error(err);
        req.flash("error_msg", "Failed to update recommendation list");
        res.redirect(`/recommendations/${req.params.id}/edit`);
    }
});

/**
 * @route   DELETE /recommendations/:id
 * @desc    Delete recommendation list
 * @access  Private
 */
router.delete("/:id", ensureAuthenticated, async (req, res) => {
    try {
        const list = await RecommendationList.findById(req.params.id);

        if (!list) {
            req.flash("error_msg", "Recommendation list not found");
            return res.redirect("/recommendations");
        }

        // Check if user is the creator
        if (list.creator.toString() !== req.user._id.toString()) {
            req.flash("error_msg", "Not authorized");
            return res.redirect("/recommendations");
        }

        await RecommendationList.findByIdAndDelete(req.params.id);

        req.flash("success_msg", "Recommendation list deleted successfully");
        res.redirect("/recommendations/my-lists");
    } catch (err) {
        console.error(err);
        req.flash("error_msg", "Failed to delete recommendation list");
        res.redirect("/recommendations");
    }
});

/**
 * @route   POST /recommendations/:id/upvote
 * @desc    Upvote a recommendation list
 * @access  Private
 */
router.post("/:id/upvote", ensureAuthenticated, async (req, res) => {
    try {
        const list = await RecommendationList.findById(req.params.id);

        if (!list) {
            return res.status(404).json({ success: false, message: "Recommendation list not found" });
        }

        // Check if user already upvoted
        const alreadyUpvoted = list.upvotedBy.includes(req.user._id);

        if (alreadyUpvoted) {
            // Remove upvote
            list.upvotes -= 1;
            list.upvotedBy = list.upvotedBy.filter(id => id.toString() !== req.user._id.toString());
        } else {
            // Add upvote
            list.upvotes += 1;
            list.upvotedBy.push(req.user._id);
        }

        await list.save();

        return res.status(200).json({
            success: true,
            upvotes: list.upvotes,
            upvoted: !alreadyUpvoted
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
});

/**
 * @route   POST /recommendations/:id/add-book/:bookId
 * @desc    Add a book to a recommendation list
 * @access  Private
 */
router.post("/:id/add-book/:bookId", ensureAuthenticated, async (req, res) => {
    try {
        const list = await RecommendationList.findById(req.params.id);
        const bookId = req.params.bookId;

        if (!list) {
            return res.status(404).json({ success: false, message: "Recommendation list not found" });
        }

        // Check if user is the creator
        if (list.creator.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: "Not authorized" });
        }

        // Check if book exists
        const book = await Book.findById(bookId);
        if (!book) {
            return res.status(404).json({ success: false, message: "Book not found" });
        }

        // Check if book is already in the list
        if (list.books.includes(bookId)) {
            return res.status(400).json({ success: false, message: "Book already in list" });
        }

        list.books.push(bookId);
        await list.save();

        return res.status(200).json({ success: true, message: "Book added to list" });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
});

module.exports = router; 