/**
 * Blog routes for reader blog column feature
 */

const express = require("express");
const router = express.Router();
const Blog = require("../models/Blog");
const Book = require("../models/Book");
const { ensureAuthenticated } = require("../middleware/auth");

/**
 * @route   GET /blog
 * @desc    Get all blogs (paginated and sorted)
 * @access  Public
 */
router.get("/", async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const sort = req.query.sort || "recent"; // Options: recent, popular
        const skip = (page - 1) * limit;

        let sortOption = {};
        if (sort === "recent") {
            sortOption = { createdAt: -1 };
        } else if (sort === "popular") {
            sortOption = { upvotes: -1 };
        }

        const blogs = await Blog.find()
            .sort(sortOption)
            .skip(skip)
            .limit(limit)
            .populate("author", "name avatar")
            .populate("bookReference", "title author coverImage");

        const totalBlogs = await Blog.countDocuments();
        const totalPages = Math.ceil(totalBlogs / limit);

        res.render("blog/index", {
            title: "Blogs - Bookish",
            user: req.user,
            blogs,
            currentPage: page,
            totalPages,
            sort
        });
    } catch (err) {
        console.error(err);
        req.flash("error_msg", "Failed to fetch blogs");
        res.redirect("/");
    }
});

/**
 * @route   GET /blog/my-blogs
 * @desc    Get user's blogs
 * @access  Private
 */
router.get("/my-blogs", ensureAuthenticated, async (req, res) => {
    try {
        const blogs = await Blog.find({ author: req.user._id })
            .sort({ createdAt: -1 })
            .populate("bookReference", "title author coverImage");

        res.render("blog/my-blogs", {
            title: "My Blogs - Bookish",
            user: req.user,
            blogs
        });
    } catch (err) {
        console.error(err);
        req.flash("error_msg", "Failed to fetch your blogs");
        res.redirect("/blog");
    }
});

/**
 * @route   GET /blog/new
 * @desc    Show create blog form
 * @access  Private
 */
router.get("/new", ensureAuthenticated, async (req, res) => {
    try {
        // Get user's books for reference selection
        const books = await Book.find().select("title author");

        res.render("blog/new", {
            title: "Write New Blog - Bookish",
            user: req.user,
            books
        });
    } catch (err) {
        console.error(err);
        req.flash("error_msg", "Failed to load form");
        res.redirect("/blog");
    }
});

/**
 * @route   POST /blog
 * @desc    Create a new blog
 * @access  Private
 */
router.post("/", ensureAuthenticated, async (req, res) => {
    try {
        const { title, content, bookReference } = req.body;

        // Validate input
        if (!title || !content) {
            req.flash("error_msg", "Please fill in all required fields");
            return res.redirect("/blog/new");
        }

        // Create new blog post
        const newBlog = new Blog({
            title,
            content,
            author: req.user._id,
            bookReference: bookReference || null,
        });

        await newBlog.save();

        req.flash("success_msg", "Blog post created successfully");
        res.redirect("/blog/my-blogs");
    } catch (err) {
        console.error(err);
        req.flash("error_msg", "Failed to create blog post");
        res.redirect("/blog/new");
    }
});

/**
 * @route   GET /blog/:id
 * @desc    View single blog
 * @access  Public
 */
router.get("/:id", async (req, res) => {
    try {
        const blog = await Blog.findById(req.params.id)
            .populate("author", "name avatar")
            .populate("bookReference", "title author coverImage isbn");

        if (!blog) {
            req.flash("error_msg", "Blog post not found");
            return res.redirect("/blog");
        }

        res.render("blog/show", {
            title: `${blog.title} - Bookish`,
            user: req.user,
            blog,
            hasUpvoted: req.user ? blog.upvotedBy.includes(req.user._id) : false
        });
    } catch (err) {
        console.error(err);
        req.flash("error_msg", "Failed to load blog post");
        res.redirect("/blog");
    }
});

/**
 * @route   GET /blog/:id/edit
 * @desc    Show edit blog form
 * @access  Private
 */
router.get("/:id/edit", ensureAuthenticated, async (req, res) => {
    try {
        const blog = await Blog.findById(req.params.id);
        const books = await Book.find().select("title author");

        if (!blog) {
            req.flash("error_msg", "Blog post not found");
            return res.redirect("/blog");
        }

        // Check if user is the author
        if (blog.author.toString() !== req.user._id.toString()) {
            req.flash("error_msg", "Not authorized");
            return res.redirect("/blog");
        }

        res.render("blog/edit", {
            title: "Edit Blog - Bookish",
            user: req.user,
            blog,
            books
        });
    } catch (err) {
        console.error(err);
        req.flash("error_msg", "Failed to load edit form");
        res.redirect("/blog");
    }
});

/**
 * @route   PUT /blog/:id
 * @desc    Update blog
 * @access  Private
 */
router.put("/:id", ensureAuthenticated, async (req, res) => {
    try {
        const { title, content, bookReference } = req.body;
        const blog = await Blog.findById(req.params.id);

        if (!blog) {
            req.flash("error_msg", "Blog post not found");
            return res.redirect("/blog");
        }

        // Check if user is the author
        if (blog.author.toString() !== req.user._id.toString()) {
            req.flash("error_msg", "Not authorized");
            return res.redirect("/blog");
        }

        // Update blog
        blog.title = title;
        blog.content = content;
        blog.bookReference = bookReference || null;
        blog.updatedAt = Date.now();

        await blog.save();

        req.flash("success_msg", "Blog post updated successfully");
        res.redirect(`/blog/${blog._id}`);
    } catch (err) {
        console.error(err);
        req.flash("error_msg", "Failed to update blog post");
        res.redirect(`/blog/${req.params.id}/edit`);
    }
});

/**
 * @route   DELETE /blog/:id
 * @desc    Delete blog
 * @access  Private
 */
router.delete("/:id", ensureAuthenticated, async (req, res) => {
    try {
        const blog = await Blog.findById(req.params.id);

        if (!blog) {
            req.flash("error_msg", "Blog post not found");
            return res.redirect("/blog");
        }

        // Check if user is the author
        if (blog.author.toString() !== req.user._id.toString()) {
            req.flash("error_msg", "Not authorized");
            return res.redirect("/blog");
        }

        await Blog.findByIdAndDelete(req.params.id);

        req.flash("success_msg", "Blog post deleted successfully");
        res.redirect("/blog/my-blogs");
    } catch (err) {
        console.error(err);
        req.flash("error_msg", "Failed to delete blog post");
        res.redirect("/blog");
    }
});

/**
 * @route   POST /blog/:id/upvote
 * @desc    Upvote a blog
 * @access  Private
 */
router.post("/:id/upvote", ensureAuthenticated, async (req, res) => {
    try {
        const blog = await Blog.findById(req.params.id);

        if (!blog) {
            return res.status(404).json({ success: false, message: "Blog not found" });
        }

        // Check if user already upvoted
        const alreadyUpvoted = blog.upvotedBy.includes(req.user._id);

        if (alreadyUpvoted) {
            // Remove upvote
            blog.upvotes -= 1;
            blog.upvotedBy = blog.upvotedBy.filter(id => id.toString() !== req.user._id.toString());
        } else {
            // Add upvote
            blog.upvotes += 1;
            blog.upvotedBy.push(req.user._id);
        }

        await blog.save();

        return res.status(200).json({
            success: true,
            upvotes: blog.upvotes,
            upvoted: !alreadyUpvoted
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
});

module.exports = router; 