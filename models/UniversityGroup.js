/**
 * UniversityGroup model for university-based student groups
 */

const mongoose = require("mongoose");

const ResourceSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, "Please add a title"],
        trim: true,
        maxlength: [100, "Title cannot be more than 100 characters"],
    },
    description: {
        type: String,
        required: [true, "Please add a description"],
    },
    fileUrl: {
        type: String,
        required: [true, "Please upload a file"],
    },
    fileType: {
        type: String,
        enum: ["pdf", "doc", "ppt", "xls", "zip", "other"],
        required: [true, "Please specify file type"],
    },
    uploader: {
        type: mongoose.Schema.ObjectId,
        ref: "User",
        required: true,
    },
    isPaid: {
        type: Boolean,
        default: false,
    },
    price: {
        type: Number,
        default: 0,
        min: 0,
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

const UniversityGroupSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, "Please add a name"],
        trim: true,
        maxlength: [100, "Name cannot be more than 100 characters"],
    },
    university: {
        type: String,
        required: [true, "Please add a university name"],
    },
    department: {
        type: String,
        required: [true, "Please add a department"],
    },
    year: {
        type: String,
    },
    description: {
        type: String,
        required: [true, "Please add a description"],
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
    resources: [ResourceSchema],
    isVerified: {
        type: Boolean,
        default: false,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    }
});

// Create text index for search
UniversityGroupSchema.index({
    name: "text",
    university: "text",
    department: "text",
    description: "text"
});

module.exports = mongoose.model("UniversityGroup", UniversityGroupSchema); 