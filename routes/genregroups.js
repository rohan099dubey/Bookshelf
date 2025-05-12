/**
 * Genre Groups routes for community features
 */

const express = require("express");
const router = express.Router();
const GenreGroup = require("../models/GenreGroup");
const { ensureAuthenticated } = require("../middleware/auth");

/**
 * @route   GET /groups
 * @desc    Get all genre groups
 * @access  Public
 */
router.get("/", async (req, res) => {
    try {
        const groups = await GenreGroup.find()
            .sort({ createdAt: -1 })
            .populate("creator", "name avatar")
            .populate("members", "name avatar");

        res.render("groups/index", {
            title: "Genre Groups - Bookish",
            user: req.user,
            groups
        });
    } catch (err) {
        console.error(err);
        req.flash("error_msg", "Failed to fetch genre groups");
        res.redirect("/");
    }
});

/**
 * @route   GET /groups/my-groups
 * @desc    Get user's joined groups
 * @access  Private
 */
router.get("/my-groups", ensureAuthenticated, async (req, res) => {
    try {
        const groups = await GenreGroup.find({
            $or: [
                { creator: req.user._id },
                { members: req.user._id }
            ]
        })
            .sort({ createdAt: -1 })
            .populate("creator", "name avatar")
            .populate("members", "name avatar");

        res.render("groups/my-groups", {
            title: "My Groups - Bookish",
            user: req.user,
            groups
        });
    } catch (err) {
        console.error(err);
        req.flash("error_msg", "Failed to fetch your groups");
        res.redirect("/groups");
    }
});

/**
 * @route   GET /groups/new
 * @desc    Show create group form
 * @access  Private
 */
router.get("/new", ensureAuthenticated, (req, res) => {
    res.render("groups/new", {
        title: "Create Genre Group - Bookish",
        user: req.user
    });
});

/**
 * @route   POST /groups
 * @desc    Create a new genre group
 * @access  Private
 */
router.post("/", ensureAuthenticated, async (req, res) => {
    try {
        const { name, description, genre } = req.body;

        // Validate input
        if (!name || !description || !genre) {
            req.flash("error_msg", "Please fill in all required fields");
            return res.redirect("/groups/new");
        }

        // Create new group
        const newGroup = new GenreGroup({
            name,
            description,
            genre,
            creator: req.user._id,
            members: [req.user._id] // Add creator as a member
        });

        await newGroup.save();

        req.flash("success_msg", "Genre group created successfully");
        res.redirect(`/groups/${newGroup._id}`);
    } catch (err) {
        console.error(err);
        req.flash("error_msg", "Failed to create genre group");
        res.redirect("/groups/new");
    }
});

/**
 * @route   GET /groups/:id
 * @desc    View single genre group
 * @access  Public
 */
router.get("/:id", async (req, res) => {
    try {
        const group = await GenreGroup.findById(req.params.id)
            .populate("creator", "name avatar")
            .populate("members", "name avatar")
            .populate("posts.author", "name avatar")
            .populate("posts.comments.author", "name avatar");

        if (!group) {
            req.flash("error_msg", "Genre group not found");
            return res.redirect("/groups");
        }

        res.render("groups/show", {
            title: `${group.name} - Bookish`,
            user: req.user,
            group,
            isMember: req.user ? group.members.some(member => member._id.toString() === req.user._id.toString()) : false,
            isCreator: req.user ? group.creator._id.toString() === req.user._id.toString() : false
        });
    } catch (err) {
        console.error(err);
        req.flash("error_msg", "Failed to load genre group");
        res.redirect("/groups");
    }
});

/**
 * @route   GET /groups/:id/edit
 * @desc    Show edit group form
 * @access  Private
 */
router.get("/:id/edit", ensureAuthenticated, async (req, res) => {
    try {
        const group = await GenreGroup.findById(req.params.id);

        if (!group) {
            req.flash("error_msg", "Genre group not found");
            return res.redirect("/groups");
        }

        // Check if user is the creator
        if (group.creator.toString() !== req.user._id.toString()) {
            req.flash("error_msg", "Not authorized");
            return res.redirect(`/groups/${group._id}`);
        }

        res.render("groups/edit", {
            title: "Edit Genre Group - Bookish",
            user: req.user,
            group
        });
    } catch (err) {
        console.error(err);
        req.flash("error_msg", "Failed to load edit form");
        res.redirect("/groups");
    }
});

/**
 * @route   PUT /groups/:id
 * @desc    Update genre group
 * @access  Private
 */
router.put("/:id", ensureAuthenticated, async (req, res) => {
    try {
        const { name, description, genre } = req.body;
        const group = await GenreGroup.findById(req.params.id);

        if (!group) {
            req.flash("error_msg", "Genre group not found");
            return res.redirect("/groups");
        }

        // Check if user is the creator
        if (group.creator.toString() !== req.user._id.toString()) {
            req.flash("error_msg", "Not authorized");
            return res.redirect(`/groups/${group._id}`);
        }

        // Update group
        group.name = name;
        group.description = description;
        group.genre = genre;

        await group.save();

        req.flash("success_msg", "Genre group updated successfully");
        res.redirect(`/groups/${group._id}`);
    } catch (err) {
        console.error(err);
        req.flash("error_msg", "Failed to update genre group");
        res.redirect(`/groups/${req.params.id}/edit`);
    }
});

/**
 * @route   DELETE /groups/:id
 * @desc    Delete genre group
 * @access  Private
 */
router.delete("/:id", ensureAuthenticated, async (req, res) => {
    try {
        const group = await GenreGroup.findById(req.params.id);

        if (!group) {
            req.flash("error_msg", "Genre group not found");
            return res.redirect("/groups");
        }

        // Check if user is the creator
        if (group.creator.toString() !== req.user._id.toString()) {
            req.flash("error_msg", "Not authorized");
            return res.redirect(`/groups/${group._id}`);
        }

        await GenreGroup.findByIdAndDelete(req.params.id);

        req.flash("success_msg", "Genre group deleted successfully");
        res.redirect("/groups");
    } catch (err) {
        console.error(err);
        req.flash("error_msg", "Failed to delete genre group");
        res.redirect(`/groups/${req.params.id}`);
    }
});

/**
 * @route   POST /groups/:id/join
 * @desc    Join a group
 * @access  Private
 */
router.post("/:id/join", ensureAuthenticated, async (req, res) => {
    try {
        const group = await GenreGroup.findById(req.params.id);

        if (!group) {
            req.flash("error_msg", "Genre group not found");
            return res.redirect("/groups");
        }

        // Check if user is already a member
        if (group.members.includes(req.user._id)) {
            req.flash("error_msg", "You are already a member of this group");
            return res.redirect(`/groups/${group._id}`);
        }

        group.members.push(req.user._id);
        await group.save();

        req.flash("success_msg", "You have joined the group successfully");
        res.redirect(`/groups/${group._id}`);
    } catch (err) {
        console.error(err);
        req.flash("error_msg", "Failed to join group");
        res.redirect(`/groups/${req.params.id}`);
    }
});

/**
 * @route   POST /groups/:id/leave
 * @desc    Leave a group
 * @access  Private
 */
router.post("/:id/leave", ensureAuthenticated, async (req, res) => {
    try {
        const group = await GenreGroup.findById(req.params.id);

        if (!group) {
            req.flash("error_msg", "Genre group not found");
            return res.redirect("/groups");
        }

        // Check if user is the creator
        if (group.creator.toString() === req.user._id.toString()) {
            req.flash("error_msg", "Group creator cannot leave the group. You can delete it instead.");
            return res.redirect(`/groups/${group._id}`);
        }

        // Check if user is a member
        if (!group.members.includes(req.user._id)) {
            req.flash("error_msg", "You are not a member of this group");
            return res.redirect(`/groups/${group._id}`);
        }

        group.members = group.members.filter(id => id.toString() !== req.user._id.toString());
        await group.save();

        req.flash("success_msg", "You have left the group successfully");
        res.redirect("/groups");
    } catch (err) {
        console.error(err);
        req.flash("error_msg", "Failed to leave group");
        res.redirect(`/groups/${req.params.id}`);
    }
});

/**
 * @route   POST /groups/:id/post
 * @desc    Create a post in the group
 * @access  Private
 */
router.post("/:id/post", ensureAuthenticated, async (req, res) => {
    try {
        const { title, content } = req.body;
        const group = await GenreGroup.findById(req.params.id);

        if (!group) {
            req.flash("error_msg", "Genre group not found");
            return res.redirect("/groups");
        }

        // Check if user is a member
        if (!group.members.some(member => member.toString() === req.user._id.toString())) {
            req.flash("error_msg", "You must be a member to post in this group");
            return res.redirect(`/groups/${group._id}`);
        }

        // Create new post
        const newPost = {
            title,
            content,
            author: req.user._id
        };

        group.posts.unshift(newPost);
        await group.save();

        req.flash("success_msg", "Post created successfully");
        res.redirect(`/groups/${group._id}`);
    } catch (err) {
        console.error(err);
        req.flash("error_msg", "Failed to create post");
        res.redirect(`/groups/${req.params.id}`);
    }
});

/**
 * @route   POST /groups/:id/post/:postId/comment
 * @desc    Add a comment to a post
 * @access  Private
 */
router.post("/:id/post/:postId/comment", ensureAuthenticated, async (req, res) => {
    try {
        const { content } = req.body;
        const group = await GenreGroup.findById(req.params.id);

        if (!group) {
            req.flash("error_msg", "Genre group not found");
            return res.redirect("/groups");
        }

        // Check if user is a member
        if (!group.members.some(member => member.toString() === req.user._id.toString())) {
            req.flash("error_msg", "You must be a member to comment in this group");
            return res.redirect(`/groups/${group._id}`);
        }

        // Find the post
        const post = group.posts.id(req.params.postId);
        if (!post) {
            req.flash("error_msg", "Post not found");
            return res.redirect(`/groups/${group._id}`);
        }

        // Add comment
        post.comments.push({
            content,
            author: req.user._id
        });

        await group.save();

        req.flash("success_msg", "Comment added successfully");
        res.redirect(`/groups/${group._id}`);
    } catch (err) {
        console.error(err);
        req.flash("error_msg", "Failed to add comment");
        res.redirect(`/groups/${req.params.id}`);
    }
});

/**
 * @route   POST /groups/:id/post/:postId/upvote
 * @desc    Upvote a post
 * @access  Private
 */
router.post("/:id/post/:postId/upvote", ensureAuthenticated, async (req, res) => {
    try {
        const group = await GenreGroup.findById(req.params.id);

        if (!group) {
            return res.status(404).json({ success: false, message: "Genre group not found" });
        }

        // Check if user is a member
        if (!group.members.some(member => member.toString() === req.user._id.toString())) {
            return res.status(403).json({ success: false, message: "You must be a member to upvote posts" });
        }

        // Find the post
        const post = group.posts.id(req.params.postId);
        if (!post) {
            return res.status(404).json({ success: false, message: "Post not found" });
        }

        // Check if user already upvoted
        const alreadyUpvoted = post.upvotedBy.includes(req.user._id);

        if (alreadyUpvoted) {
            // Remove upvote
            post.upvotes -= 1;
            post.upvotedBy = post.upvotedBy.filter(id => id.toString() !== req.user._id.toString());
        } else {
            // Add upvote
            post.upvotes += 1;
            post.upvotedBy.push(req.user._id);
        }

        await group.save();

        return res.status(200).json({
            success: true,
            upvotes: post.upvotes,
            upvoted: !alreadyUpvoted
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
});

module.exports = router; 