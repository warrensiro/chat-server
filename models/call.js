const mongoose = require("mongoose");

const callSchema = new mongoose.Schema(
  {
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OneToOneMessage",
      required: true,
    },
    caller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: ["audio", "video"],
      default: "audio",
    },
    status: {
      type: String,
      enum: ["ringing", "ongoing", "missed", "rejected", "completed"],
      default: "ringing",
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    endedAt: Date,
    duration: {
      type: Number,
      default: 0, // seconds
    },
  },
  { timestamps: true }
);

// Performance indexes
callSchema.index({ caller: 1 });
callSchema.index({ receiver: 1 });
callSchema.index({ status: 1 });

module.exports = mongoose.model("Call", callSchema);