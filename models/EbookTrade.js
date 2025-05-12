/**
 * EbookTrade model for peer-to-peer e-book marketplace
 */

const mongoose = require("mongoose");

const EbookTradeSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, "Please add a title"],
        trim: true,
        maxlength: [100, "Title cannot be more than 100 characters"],
    },
    author: {
        type: String,
        required: [true, "Please add an author"],
        trim: true,
    },
    description: {
        type: String,
        required: [true, "Please add a description"],
    },
    category: {
        type: String,
        required: [true, "Please select a category"],
    },
    coverImage: {
        type: String,
        default: "default-ebook-cover.jpg",
    },
    fileUrl: {
        type: String,
        required: [true, "Please upload an e-book file"],
    },
    fileType: {
        type: String,
        enum: ["pdf", "epub", "mobi"],
        required: [true, "Please specify file type"],
    },
    price: {
        type: Number,
        required: [true, "Please add a price (0 for free)"],
        min: [0, "Price cannot be negative"],
    },
    seller: {
        type: mongoose.Schema.ObjectId,
        ref: "User",
        required: true,
    },
    buyers: [{
        user: {
            type: mongoose.Schema.ObjectId,
            ref: "User"
        },
        purchaseDate: {
            type: Date,
            default: Date.now
        },
        paymentStatus: {
            type: String,
            enum: ["pending", "completed", "refunded"],
            default: "pending"
        },
        paymentId: String
    }],
    isAvailable: {
        type: Boolean,
        default: true,
    },
    rating: {
        type: Number,
        min: 0,
        max: 5,
        default: 0,
    },
    reviewCount: {
        type: Number,
        default: 0,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    }
});

// Create text index for search
EbookTradeSchema.index({
    title: "text",
    author: "text",
    description: "text",
    category: "text",
});

module.exports = mongoose.model("EbookTrade", EbookTradeSchema); 