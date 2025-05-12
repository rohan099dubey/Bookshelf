/**
 * Blog model for reader-created content
 */

const mongoose = require("mongoose");

const BlogSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, "Please add a title"],
        trim: true,
        maxlength: [100, "Title cannot be more than 100 characters"],
    },
    content: {
        type: String,
        required: [true, "Please add content"],
    },
    author: {
        type: mongoose.Schema.ObjectId,
        ref: "User",
        required: true,
    },
    bookReference: {
        type: mongoose.Schema.ObjectId,
        ref: "Book",
    },
    upvotes: {
        type: Number,
        default: 0,
    },
    upvotedBy: [{
        type: mongoose.Schema.ObjectId,
        ref: "User"
    }],
    createdAt: {
        type: Date,
        default: Date.now,
    },
    updatedAt: {
        type: Date,
        default: Date.now,
    }
});

// Create text index for search
BlogSchema.index({
    title: "text",
    content: "text"
});

module.exports = mongoose.model("Blog", BlogSchema); 