/**
 * E-book marketplace routes for peer-to-peer book selling
 */

const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const EbookTrade = require("../models/EbookTrade");
const User = require("../models/User");
const { ensureAuthenticated } = require("../middleware/auth");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = "public/uploads/ebooks";
        // Create directory if it doesn't exist
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname);
        cb(null, uniqueSuffix + ext);
    },
});

const fileFilter = (req, file, cb) => {
    // Accept only pdf, epub, and mobi files
    const allowedTypes = [".pdf", ".epub", ".mobi"];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedTypes.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error("File type not supported. Please upload PDF, EPUB, or MOBI files."), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
});

/**
 * @route   GET /ebooks
 * @desc    Browse all e-books
 * @access  Public
 */
router.get("/", async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 12;
        const skip = (page - 1) * limit;
        const search = req.query.search || "";
        const category = req.query.category || "";
        const minPrice = req.query.minPrice || 0;
        const maxPrice = req.query.maxPrice || 10000;
        const sort = req.query.sort || "newest";

        let query = { isAvailable: true };

        // Apply search filter
        if (search) {
            query.$text = { $search: search };
        }

        // Apply category filter
        if (category) {
            query.category = category;
        }

        // Apply price filter
        query.price = { $gte: minPrice, $lte: maxPrice };

        // Set sort option
        let sortOption = {};
        if (sort === "newest") {
            sortOption = { createdAt: -1 };
        } else if (sort === "priceAsc") {
            sortOption = { price: 1 };
        } else if (sort === "priceDesc") {
            sortOption = { price: -1 };
        } else if (sort === "popular") {
            sortOption = { rating: -1 };
        }

        const ebooks = await EbookTrade.find(query)
            .sort(sortOption)
            .skip(skip)
            .limit(limit)
            .populate("seller", "name avatar");

        const totalEbooks = await EbookTrade.countDocuments(query);
        const totalPages = Math.ceil(totalEbooks / limit);

        // Get unique categories for filter
        const categories = await EbookTrade.distinct("category");

        res.render("ebooks/index", {
            title: "E-Book Marketplace - Bookish",
            user: req.user,
            ebooks,
            currentPage: page,
            totalPages,
            search,
            category,
            minPrice,
            maxPrice,
            sort,
            categories
        });
    } catch (err) {
        console.error(err);
        req.flash("error_msg", "Failed to fetch e-books");
        res.redirect("/");
    }
});

/**
 * @route   GET /ebooks/my-uploads
 * @desc    View user's uploaded e-books
 * @access  Private
 */
router.get("/my-uploads", ensureAuthenticated, async (req, res) => {
    try {
        const ebooks = await EbookTrade.find({ seller: req.user._id })
            .sort({ createdAt: -1 });

        res.render("ebooks/my-uploads", {
            title: "My E-Book Uploads - Bookish",
            user: req.user,
            ebooks
        });
    } catch (err) {
        console.error(err);
        req.flash("error_msg", "Failed to fetch your e-books");
        res.redirect("/ebooks");
    }
});

/**
 * @route   GET /ebooks/my-purchases
 * @desc    View user's purchased e-books
 * @access  Private
 */
router.get("/my-purchases", ensureAuthenticated, async (req, res) => {
    try {
        const ebooks = await EbookTrade.find({
            "buyers.user": req.user._id,
            "buyers.paymentStatus": "completed"
        })
            .sort({ "buyers.purchaseDate": -1 })
            .populate("seller", "name avatar");

        res.render("ebooks/my-purchases", {
            title: "My E-Book Purchases - Bookish",
            user: req.user,
            ebooks
        });
    } catch (err) {
        console.error(err);
        req.flash("error_msg", "Failed to fetch your purchased e-books");
        res.redirect("/ebooks");
    }
});

/**
 * @route   GET /ebooks/new
 * @desc    Show form to upload new e-book
 * @access  Private
 */
router.get("/new", ensureAuthenticated, (req, res) => {
    res.render("ebooks/new", {
        title: "Upload E-Book - Bookish",
        user: req.user
    });
});

/**
 * @route   POST /ebooks
 * @desc    Upload a new e-book
 * @access  Private
 */
router.post("/", ensureAuthenticated, upload.fields([
    { name: "ebook", maxCount: 1 },
    { name: "coverImage", maxCount: 1 }
]), async (req, res) => {
    try {
        const { title, author, description, category, price, fileType } = req.body;

        // Validate input
        if (!title || !author || !description || !category || price === undefined || !fileType) {
            req.flash("error_msg", "Please fill in all required fields");
            return res.redirect("/ebooks/new");
        }

        if (!req.files || !req.files.ebook) {
            req.flash("error_msg", "Please upload an e-book file");
            return res.redirect("/ebooks/new");
        }

        // Get file paths
        const ebookPath = `/uploads/ebooks/${req.files.ebook[0].filename}`;
        const coverImagePath = req.files.coverImage
            ? `/uploads/ebooks/${req.files.coverImage[0].filename}`
            : "/img/default-ebook-cover.jpg";

        // Create new e-book
        const newEbook = new EbookTrade({
            title,
            author,
            description,
            category,
            price,
            fileType,
            fileUrl: ebookPath,
            coverImage: coverImagePath,
            seller: req.user._id
        });

        await newEbook.save();

        req.flash("success_msg", "E-book uploaded successfully");
        res.redirect("/ebooks/my-uploads");
    } catch (err) {
        console.error(err);
        req.flash("error_msg", err.message || "Failed to upload e-book");
        res.redirect("/ebooks/new");
    }
});

/**
 * @route   GET /ebooks/:id
 * @desc    View e-book details
 * @access  Public
 */
router.get("/:id", async (req, res) => {
    try {
        const ebook = await EbookTrade.findById(req.params.id)
            .populate("seller", "name avatar")
            .populate("buyers.user", "name");

        if (!ebook) {
            req.flash("error_msg", "E-book not found");
            return res.redirect("/ebooks");
        }

        // Check if user has purchased this e-book
        let hasPurchased = false;
        if (req.user) {
            hasPurchased = ebook.buyers.some(
                buyer => buyer.user.toString() === req.user._id.toString() && buyer.paymentStatus === "completed"
            );
        }

        // Check if user is the seller
        const isSeller = req.user && ebook.seller._id.toString() === req.user._id.toString();

        res.render("ebooks/show", {
            title: `${ebook.title} - Bookish`,
            user: req.user,
            ebook,
            hasPurchased,
            isSeller,
            stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY
        });
    } catch (err) {
        console.error(err);
        req.flash("error_msg", "Failed to load e-book details");
        res.redirect("/ebooks");
    }
});

/**
 * @route   GET /ebooks/:id/edit
 * @desc    Show edit e-book form
 * @access  Private
 */
router.get("/:id/edit", ensureAuthenticated, async (req, res) => {
    try {
        const ebook = await EbookTrade.findById(req.params.id);

        if (!ebook) {
            req.flash("error_msg", "E-book not found");
            return res.redirect("/ebooks");
        }

        // Check if user is the seller
        if (ebook.seller.toString() !== req.user._id.toString()) {
            req.flash("error_msg", "Not authorized");
            return res.redirect(`/ebooks/${ebook._id}`);
        }

        res.render("ebooks/edit", {
            title: "Edit E-Book - Bookish",
            user: req.user,
            ebook
        });
    } catch (err) {
        console.error(err);
        req.flash("error_msg", "Failed to load edit form");
        res.redirect("/ebooks");
    }
});

/**
 * @route   PUT /ebooks/:id
 * @desc    Update e-book
 * @access  Private
 */
router.put("/:id", ensureAuthenticated, upload.fields([
    { name: "coverImage", maxCount: 1 }
]), async (req, res) => {
    try {
        const { title, author, description, category, price, isAvailable } = req.body;
        const ebook = await EbookTrade.findById(req.params.id);

        if (!ebook) {
            req.flash("error_msg", "E-book not found");
            return res.redirect("/ebooks");
        }

        // Check if user is the seller
        if (ebook.seller.toString() !== req.user._id.toString()) {
            req.flash("error_msg", "Not authorized");
            return res.redirect(`/ebooks/${ebook._id}`);
        }

        // Update e-book
        ebook.title = title;
        ebook.author = author;
        ebook.description = description;
        ebook.category = category;
        ebook.price = price;
        ebook.isAvailable = isAvailable === "on";

        // Update cover image if provided
        if (req.files && req.files.coverImage) {
            ebook.coverImage = `/uploads/ebooks/${req.files.coverImage[0].filename}`;
        }

        await ebook.save();

        req.flash("success_msg", "E-book updated successfully");
        res.redirect(`/ebooks/${ebook._id}`);
    } catch (err) {
        console.error(err);
        req.flash("error_msg", "Failed to update e-book");
        res.redirect(`/ebooks/${req.params.id}/edit`);
    }
});

/**
 * @route   DELETE /ebooks/:id
 * @desc    Delete e-book
 * @access  Private
 */
router.delete("/:id", ensureAuthenticated, async (req, res) => {
    try {
        const ebook = await EbookTrade.findById(req.params.id);

        if (!ebook) {
            req.flash("error_msg", "E-book not found");
            return res.redirect("/ebooks");
        }

        // Check if user is the seller
        if (ebook.seller.toString() !== req.user._id.toString()) {
            req.flash("error_msg", "Not authorized");
            return res.redirect(`/ebooks/${ebook._id}`);
        }

        // Remove file from storage
        const filePath = path.join(__dirname, "../public", ebook.fileUrl);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        // Remove cover image if it's not the default
        if (!ebook.coverImage.includes("default-ebook-cover.jpg")) {
            const coverPath = path.join(__dirname, "../public", ebook.coverImage);
            if (fs.existsSync(coverPath)) {
                fs.unlinkSync(coverPath);
            }
        }

        await EbookTrade.findByIdAndDelete(req.params.id);

        req.flash("success_msg", "E-book deleted successfully");
        res.redirect("/ebooks/my-uploads");
    } catch (err) {
        console.error(err);
        req.flash("error_msg", "Failed to delete e-book");
        res.redirect(`/ebooks/${req.params.id}`);
    }
});

/**
 * @route   GET /ebooks/:id/download
 * @desc    Download e-book file
 * @access  Private
 */
router.get("/:id/download", ensureAuthenticated, async (req, res) => {
    try {
        const ebook = await EbookTrade.findById(req.params.id);

        if (!ebook) {
            req.flash("error_msg", "E-book not found");
            return res.redirect("/ebooks");
        }

        // Check if user is the seller or has purchased the e-book
        const isSeller = ebook.seller.toString() === req.user._id.toString();
        const hasPurchased = ebook.buyers.some(
            buyer => buyer.user.toString() === req.user._id.toString() && buyer.paymentStatus === "completed"
        );

        if (!isSeller && !hasPurchased) {
            req.flash("error_msg", "You need to purchase this e-book first");
            return res.redirect(`/ebooks/${ebook._id}`);
        }

        // Send file
        const filePath = path.join(__dirname, "../public", ebook.fileUrl);
        res.download(filePath, `${ebook.title}.${ebook.fileType}`);
    } catch (err) {
        console.error(err);
        req.flash("error_msg", "Failed to download e-book");
        res.redirect(`/ebooks/${req.params.id}`);
    }
});

/**
 * @route   POST /ebooks/:id/create-payment-intent
 * @desc    Create Stripe payment intent for e-book purchase
 * @access  Private
 */
router.post("/:id/create-payment-intent", ensureAuthenticated, async (req, res) => {
    try {
        const ebook = await EbookTrade.findById(req.params.id);

        if (!ebook) {
            return res.status(404).json({ success: false, message: "E-book not found" });
        }

        // Check if e-book is available
        if (!ebook.isAvailable) {
            return res.status(400).json({ success: false, message: "E-book is not available for purchase" });
        }

        // Check if user already purchased
        const alreadyPurchased = ebook.buyers.some(
            buyer => buyer.user.toString() === req.user._id.toString() && buyer.paymentStatus === "completed"
        );

        if (alreadyPurchased) {
            return res.status(400).json({ success: false, message: "You already purchased this e-book" });
        }

        // Create payment intent
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(ebook.price * 100), // Convert to cents
            currency: "inr",
            metadata: {
                userId: req.user._id.toString(),
                ebookId: ebook._id.toString()
            }
        });

        // Add buyer to e-book with pending status
        ebook.buyers.push({
            user: req.user._id,
            paymentStatus: "pending",
            paymentId: paymentIntent.id
        });

        await ebook.save();

        return res.status(200).json({
            success: true,
            clientSecret: paymentIntent.client_secret
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
});

/**
 * @route   POST /ebooks/:id/payment-success
 * @desc    Update payment status after successful payment
 * @access  Private
 */
router.post("/:id/payment-success", ensureAuthenticated, async (req, res) => {
    try {
        const { paymentIntentId } = req.body;
        const ebook = await EbookTrade.findById(req.params.id);

        if (!ebook) {
            return res.status(404).json({ success: false, message: "E-book not found" });
        }

        // Find the buyer
        const buyerIndex = ebook.buyers.findIndex(
            buyer => buyer.user.toString() === req.user._id.toString() && buyer.paymentId === paymentIntentId
        );

        if (buyerIndex === -1) {
            return res.status(404).json({ success: false, message: "Purchase record not found" });
        }

        // Update payment status
        ebook.buyers[buyerIndex].paymentStatus = "completed";

        await ebook.save();

        return res.status(200).json({ success: true });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
});

module.exports = router; 