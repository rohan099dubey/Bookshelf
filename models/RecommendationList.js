/**
 * Recommendation List model for user-curated book lists
 */

const mongoose = require("mongoose");

const RecommendationListSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, "Please add a title"],
        trim: true,
        maxlength: [100, "Title cannot be more than 100 characters"],
    },
    description: {
        type: String,
        required: [true, "Please add a description"],
        trim: true,
        maxlength: [500, "Description cannot be more than 500 characters"],
    },
    creator: {
        type: mongoose.Schema.ObjectId,
        ref: "User",
        required: true,
    },
    books: [{
        type: mongoose.Schema.ObjectId,
        ref: "Book"
    }],
    upvotes: {
        type: Number,
        default: 0,
    },
    upvotedBy: [{
        type: mongoose.Schema.ObjectId,
        ref: "User"
    }],
    isPublic: {
        type: Boolean,
        default: true,
    },
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
RecommendationListSchema.index({
    title: "text",
    description: "text"
});

module.exports = mongoose.model("RecommendationList", RecommendationListSchema); 