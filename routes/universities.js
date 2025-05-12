/**
 * University Group routes for student resource sharing
 */

const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const UniversityGroup = require("../models/UniversityGroup");
const User = require("../models/User");
const { ensureAuthenticated } = require("../middleware/auth");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = "public/uploads/resources";
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
    }
});

const fileFilter = (req, file, cb) => {
    // Accept common document and archive file types
    const allowedTypes = [
        ".pdf", ".doc", ".docx", ".ppt", ".pptx",
        ".xls", ".xlsx", ".txt", ".zip", ".rar"
    ];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedTypes.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error("File type not supported. Please upload common document formats."), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

/**
 * @route   GET /universities
 * @desc    Browse all university groups
 * @access  Public
 */
router.get("/", async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 12;
        const skip = (page - 1) * limit;
        const search = req.query.search || "";
        const university = req.query.university || "";
        const department = req.query.department || "";

        let query = {};

        // Apply search filter
        if (search) {
            query.$text = { $search: search };
        }

        // Apply university filter
        if (university) {
            query.university = university;
        }

        // Apply department filter
        if (department) {
            query.department = department;
        }

        const groups = await UniversityGroup.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate("creator", "name avatar")
            .populate("members", "name avatar", null, { limit: 5 });

        const totalGroups = await UniversityGroup.countDocuments(query);
        const totalPages = Math.ceil(totalGroups / limit);

        // Get unique universities and departments for filters
        const universities = await UniversityGroup.distinct("university");
        const departments = await UniversityGroup.distinct("department");

        res.render("universities/index", {
            title: "University Groups - Bookish",
            user: req.user,
            groups,
            currentPage: page,
            totalPages,
            search,
            university,
            department,
            universities,
            departments
        });
    } catch (err) {
        console.error(err);
        req.flash("error_msg", "Failed to fetch university groups");
        res.redirect("/");
    }
});

/**
 * @route   GET /universities/my-groups
 * @desc    View user's joined university groups
 * @access  Private
 */
router.get("/my-groups", ensureAuthenticated, async (req, res) => {
    try {
        const groups = await UniversityGroup.find({
            $or: [
                { creator: req.user._id },
                { members: req.user._id }
            ]
        })
            .sort({ createdAt: -1 })
            .populate("creator", "name avatar")
            .populate("members", "name avatar", null, { limit: 5 });

        res.render("universities/my-groups", {
            title: "My University Groups - Bookish",
            user: req.user,
            groups
        });
    } catch (err) {
        console.error(err);
        req.flash("error_msg", "Failed to fetch your university groups");
        res.redirect("/universities");
    }
});

/**
 * @route   GET /universities/new
 * @desc    Show create university group form
 * @access  Private
 */
router.get("/new", ensureAuthenticated, (req, res) => {
    res.render("universities/new", {
        title: "Create University Group - Bookish",
        user: req.user
    });
});

/**
 * @route   POST /universities
 * @desc    Create a new university group
 * @access  Private
 */
router.post("/", ensureAuthenticated, async (req, res) => {
    try {
        const { name, university, department, year, description } = req.body;

        // Validate input
        if (!name || !university || !department || !description) {
            req.flash("error_msg", "Please fill in all required fields");
            return res.redirect("/universities/new");
        }

        // Create new university group
        const newGroup = new UniversityGroup({
            name,
            university,
            department,
            year: year || "All years",
            description,
            creator: req.user._id,
            members: [req.user._id], // Add creator as a member
        });

        await newGroup.save();

        req.flash("success_msg", "University group created successfully");
        res.redirect(`/universities/${newGroup._id}`);
    } catch (err) {
        console.error(err);
        req.flash("error_msg", "Failed to create university group");
        res.redirect("/universities/new");
    }
});

/**
 * @route   GET /universities/:id
 * @desc    View single university group
 * @access  Public
 */
router.get("/:id", async (req, res) => {
    try {
        const group = await UniversityGroup.findById(req.params.id)
            .populate("creator", "name avatar")
            .populate("members", "name avatar")
            .populate("resources.uploader", "name avatar")
            .populate("resources.comments.author", "name avatar");

        if (!group) {
            req.flash("error_msg", "University group not found");
            return res.redirect("/universities");
        }

        // Check if user is a member
        const isMember = req.user && group.members.some(member => member._id.toString() === req.user._id.toString());

        // Check if user is the creator
        const isCreator = req.user && group.creator._id.toString() === req.user._id.toString();

        res.render("universities/show", {
            title: `${group.name} - Bookish`,
            user: req.user,
            group,
            isMember,
            isCreator,
            stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY
        });
    } catch (err) {
        console.error(err);
        req.flash("error_msg", "Failed to load university group");
        res.redirect("/universities");
    }
});

/**
 * @route   GET /universities/:id/edit
 * @desc    Show edit university group form
 * @access  Private
 */
router.get("/:id/edit", ensureAuthenticated, async (req, res) => {
    try {
        const group = await UniversityGroup.findById(req.params.id);

        if (!group) {
            req.flash("error_msg", "University group not found");
            return res.redirect("/universities");
        }

        // Check if user is the creator
        if (group.creator.toString() !== req.user._id.toString()) {
            req.flash("error_msg", "Not authorized");
            return res.redirect(`/universities/${group._id}`);
        }

        res.render("universities/edit", {
            title: "Edit University Group - Bookish",
            user: req.user,
            group
        });
    } catch (err) {
        console.error(err);
        req.flash("error_msg", "Failed to load edit form");
        res.redirect("/universities");
    }
});

/**
 * @route   PUT /universities/:id
 * @desc    Update university group
 * @access  Private
 */
router.put("/:id", ensureAuthenticated, async (req, res) => {
    try {
        const { name, university, department, year, description } = req.body;
        const group = await UniversityGroup.findById(req.params.id);

        if (!group) {
            req.flash("error_msg", "University group not found");
            return res.redirect("/universities");
        }

        // Check if user is the creator
        if (group.creator.toString() !== req.user._id.toString()) {
            req.flash("error_msg", "Not authorized");
            return res.redirect(`/universities/${group._id}`);
        }

        // Update group
        group.name = name;
        group.university = university;
        group.department = department;
        group.year = year || "All years";
        group.description = description;

        await group.save();

        req.flash("success_msg", "University group updated successfully");
        res.redirect(`/universities/${group._id}`);
    } catch (err) {
        console.error(err);
        req.flash("error_msg", "Failed to update university group");
        res.redirect(`/universities/${req.params.id}/edit`);
    }
});

/**
 * @route   DELETE /universities/:id
 * @desc    Delete university group
 * @access  Private
 */
router.delete("/:id", ensureAuthenticated, async (req, res) => {
    try {
        const group = await UniversityGroup.findById(req.params.id);

        if (!group) {
            req.flash("error_msg", "University group not found");
            return res.redirect("/universities");
        }

        // Check if user is the creator
        if (group.creator.toString() !== req.user._id.toString()) {
            req.flash("error_msg", "Not authorized");
            return res.redirect(`/universities/${group._id}`);
        }

        // Delete all resource files
        group.resources.forEach(resource => {
            const filePath = path.join(__dirname, "../public", resource.fileUrl);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        });

        await UniversityGroup.findByIdAndDelete(req.params.id);

        req.flash("success_msg", "University group deleted successfully");
        res.redirect("/universities");
    } catch (err) {
        console.error(err);
        req.flash("error_msg", "Failed to delete university group");
        res.redirect(`/universities/${req.params.id}`);
    }
});

/**
 * @route   POST /universities/:id/join
 * @desc    Join a university group
 * @access  Private
 */
router.post("/:id/join", ensureAuthenticated, async (req, res) => {
    try {
        const group = await UniversityGroup.findById(req.params.id);

        if (!group) {
            req.flash("error_msg", "University group not found");
            return res.redirect("/universities");
        }

        // Check if user is already a member
        if (group.members.includes(req.user._id)) {
            req.flash("error_msg", "You are already a member of this group");
            return res.redirect(`/universities/${group._id}`);
        }

        group.members.push(req.user._id);
        await group.save();

        req.flash("success_msg", "You have joined the group successfully");
        res.redirect(`/universities/${group._id}`);
    } catch (err) {
        console.error(err);
        req.flash("error_msg", "Failed to join group");
        res.redirect(`/universities/${req.params.id}`);
    }
});

/**
 * @route   POST /universities/:id/leave
 * @desc    Leave a university group
 * @access  Private
 */
router.post("/:id/leave", ensureAuthenticated, async (req, res) => {
    try {
        const group = await UniversityGroup.findById(req.params.id);

        if (!group) {
            req.flash("error_msg", "University group not found");
            return res.redirect("/universities");
        }

        // Check if user is the creator
        if (group.creator.toString() === req.user._id.toString()) {
            req.flash("error_msg", "Group creator cannot leave the group. You can delete it instead.");
            return res.redirect(`/universities/${group._id}`);
        }

        // Check if user is a member
        if (!group.members.includes(req.user._id)) {
            req.flash("error_msg", "You are not a member of this group");
            return res.redirect(`/universities/${group._id}`);
        }

        group.members = group.members.filter(id => id.toString() !== req.user._id.toString());
        await group.save();

        req.flash("success_msg", "You have left the group successfully");
        res.redirect("/universities");
    } catch (err) {
        console.error(err);
        req.flash("error_msg", "Failed to leave group");
        res.redirect(`/universities/${req.params.id}`);
    }
});

/**
 * @route   POST /universities/:id/resource
 * @desc    Upload a resource to a university group
 * @access  Private
 */
router.post("/:id/resource", ensureAuthenticated, upload.single("resource"), async (req, res) => {
    try {
        const { title, description, isPaid, price, fileType } = req.body;
        const group = await UniversityGroup.findById(req.params.id);

        if (!group) {
            req.flash("error_msg", "University group not found");
            return res.redirect("/universities");
        }

        // Check if user is a member
        if (!group.members.some(member => member.toString() === req.user._id.toString())) {
            req.flash("error_msg", "You must be a member to upload resources");
            return res.redirect(`/universities/${group._id}`);
        }

        // Check if file was uploaded
        if (!req.file) {
            req.flash("error_msg", "Please upload a file");
            return res.redirect(`/universities/${group._id}`);
        }

        // Create new resource
        const newResource = {
            title,
            description,
            fileUrl: `/uploads/resources/${req.file.filename}`,
            fileType: fileType || path.extname(req.file.originalname).substring(1),
            uploader: req.user._id,
            isPaid: isPaid === "on",
            price: isPaid === "on" ? parseFloat(price) : 0
        };

        group.resources.push(newResource);
        await group.save();

        req.flash("success_msg", "Resource uploaded successfully");
        res.redirect(`/universities/${group._id}`);
    } catch (err) {
        console.error(err);
        req.flash("error_msg", err.message || "Failed to upload resource");
        res.redirect(`/universities/${req.params.id}`);
    }
});

/**
 * @route   GET /universities/:id/resource/:resourceId
 * @desc    View resource details
 * @access  Private
 */
router.get("/:id/resource/:resourceId", ensureAuthenticated, async (req, res) => {
    try {
        const group = await UniversityGroup.findById(req.params.id);

        if (!group) {
            req.flash("error_msg", "University group not found");
            return res.redirect("/universities");
        }

        // Find the resource
        const resource = group.resources.id(req.params.resourceId);
        if (!resource) {
            req.flash("error_msg", "Resource not found");
            return res.redirect(`/universities/${group._id}`);
        }

        // Check if user is a member
        const isMember = group.members.some(member => member.toString() === req.user._id.toString());
        if (!isMember) {
            req.flash("error_msg", "You must be a member to view resources");
            return res.redirect(`/universities/${group._id}`);
        }

        // Populate uploader and comments
        await UniversityGroup.populate(group, {
            path: "resources.uploader",
            select: "name avatar",
            model: "User"
        });

        await UniversityGroup.populate(group, {
            path: "resources.comments.author",
            select: "name avatar",
            model: "User"
        });

        const resourceWithPopulations = group.resources.id(req.params.resourceId);

        res.render("universities/resource", {
            title: resourceWithPopulations.title,
            user: req.user,
            group,
            resource: resourceWithPopulations,
            isUploader: resourceWithPopulations.uploader._id.toString() === req.user._id.toString(),
            hasUpvoted: resourceWithPopulations.upvotedBy.includes(req.user._id),
            stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY
        });
    } catch (err) {
        console.error(err);
        req.flash("error_msg", "Failed to load resource");
        res.redirect(`/universities/${req.params.id}`);
    }
});

/**
 * @route   GET /universities/:id/resource/:resourceId/download
 * @desc    Download a resource
 * @access  Private
 */
router.get("/:id/resource/:resourceId/download", ensureAuthenticated, async (req, res) => {
    try {
        const group = await UniversityGroup.findById(req.params.id);

        if (!group) {
            req.flash("error_msg", "University group not found");
            return res.redirect("/universities");
        }

        // Check if user is a member
        const isMember = group.members.some(member => member.toString() === req.user._id.toString());
        if (!isMember) {
            req.flash("error_msg", "You must be a member to download resources");
            return res.redirect(`/universities/${group._id}`);
        }

        // Find the resource
        const resource = group.resources.id(req.params.resourceId);
        if (!resource) {
            req.flash("error_msg", "Resource not found");
            return res.redirect(`/universities/${group._id}`);
        }

        // Check if the resource is paid and if the user has paid for it
        if (resource.isPaid && resource.uploader.toString() !== req.user._id.toString()) {
            // Check if user has paid
            const hasPaid = false; // TODO: Implement payment verification

            if (!hasPaid) {
                req.flash("error_msg", "You need to purchase this resource first");
                return res.redirect(`/universities/${group._id}/resource/${resource._id}`);
            }
        }

        // Send file
        const filePath = path.join(__dirname, "../public", resource.fileUrl);
        res.download(filePath, `${resource.title}.${resource.fileType}`);
    } catch (err) {
        console.error(err);
        req.flash("error_msg", "Failed to download resource");
        res.redirect(`/universities/${req.params.id}`);
    }
});

/**
 * @route   POST /universities/:id/resource/:resourceId/comment
 * @desc    Add a comment to a resource
 * @access  Private
 */
router.post("/:id/resource/:resourceId/comment", ensureAuthenticated, async (req, res) => {
    try {
        const { content } = req.body;
        const group = await UniversityGroup.findById(req.params.id);

        if (!group) {
            req.flash("error_msg", "University group not found");
            return res.redirect("/universities");
        }

        // Check if user is a member
        if (!group.members.some(member => member.toString() === req.user._id.toString())) {
            req.flash("error_msg", "You must be a member to comment on resources");
            return res.redirect(`/universities/${group._id}`);
        }

        // Find the resource
        const resource = group.resources.id(req.params.resourceId);
        if (!resource) {
            req.flash("error_msg", "Resource not found");
            return res.redirect(`/universities/${group._id}`);
        }

        // Add comment
        resource.comments.push({
            content,
            author: req.user._id
        });

        await group.save();

        req.flash("success_msg", "Comment added successfully");
        res.redirect(`/universities/${group._id}/resource/${resource._id}`);
    } catch (err) {
        console.error(err);
        req.flash("error_msg", "Failed to add comment");
        res.redirect(`/universities/${req.params.id}/resource/${req.params.resourceId}`);
    }
});

/**
 * @route   POST /universities/:id/resource/:resourceId/upvote
 * @desc    Upvote a resource
 * @access  Private
 */
router.post("/:id/resource/:resourceId/upvote", ensureAuthenticated, async (req, res) => {
    try {
        const group = await UniversityGroup.findById(req.params.id);

        if (!group) {
            return res.status(404).json({ success: false, message: "University group not found" });
        }

        // Check if user is a member
        if (!group.members.some(member => member.toString() === req.user._id.toString())) {
            return res.status(403).json({ success: false, message: "You must be a member to upvote resources" });
        }

        // Find the resource
        const resource = group.resources.id(req.params.resourceId);
        if (!resource) {
            return res.status(404).json({ success: false, message: "Resource not found" });
        }

        // Check if user already upvoted
        const alreadyUpvoted = resource.upvotedBy.includes(req.user._id);

        if (alreadyUpvoted) {
            // Remove upvote
            resource.upvotes -= 1;
            resource.upvotedBy = resource.upvotedBy.filter(id => id.toString() !== req.user._id.toString());
        } else {
            // Add upvote
            resource.upvotes += 1;
            resource.upvotedBy.push(req.user._id);
        }

        await group.save();

        return res.status(200).json({
            success: true,
            upvotes: resource.upvotes,
            upvoted: !alreadyUpvoted
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
});

module.exports = router; 