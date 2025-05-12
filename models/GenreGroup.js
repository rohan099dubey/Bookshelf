/**
 * Genre Group model for genre-based communities
 */

const mongoose = require("mongoose");

const PostSchema = new mongoose.Schema({
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
    upvotes: {
        type: Number,
        default: 0,
    },
    upvotedBy: [{
        type: mongoose.Schema.ObjectId,
        ref: "User"
    }],
    comments: [{
        content: {
            type: String,
            required: true
        },
        author: {
            type: mongoose.Schema.ObjectId,
            ref: "User",
            required: true
        },
        createdAt: {
            type: Date,
            default: Date.now
        }
    }],
    createdAt: {
        type: Date,
        default: Date.now,
    }
});

const GenreGroupSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, "Please add a name"],
        trim: true,
        maxlength: [50, "Name cannot be more than 50 characters"],
    },
    description: {
        type: String,
        required: [true, "Please add a description"],
        trim: true,
        maxlength: [500, "Description cannot be more than 500 characters"],
    },
    genre: {
        type: String,
        required: [true, "Please select a genre"],
        trim: true,
    },
    creator: {
        type: mongoose.Schema.ObjectId,
        ref: "User",
        required: true,
    },
    members: [{
        type: mongoose.Schema.ObjectId,
        ref: "User"
    }],
    posts: [PostSchema],
    createdAt: {
        type: Date,
        default: Date.now,
    }
});

// Create text index for search
GenreGroupSchema.index({
    name: "text",
    description: "text",
    genre: "text"
});

module.exports = mongoose.model("GenreGroup", GenreGroupSchema); 