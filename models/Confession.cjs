const mongoose = require("mongoose");

const confessionSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      required: [true, "Confession text is required"],
      trim: true,
    },
    category: {
      type: String,
      default: "General",
      enum: [
        "General",
        "GWY Fellowship",
        "Late Night Thoughts",
        "Gratitude & Kindness",
        "Heavy Heart",
      ],
    },
    color: {
      type: String,
      default: "#f5e6c8",
    },
    pinnedStyle: {
      type: String,
      enum: ["pin", "clip", "tape"],
      default: "pin",
    },
    reactions: {
      candle: {
        type: Number,
        default: 0,
        min: 0,
      },
      hug: {
        type: Number,
        default: 0,
        min: 0,
      },
      support: {
        type: Number,
        default: 0,
        min: 0,
      },
    },
    // Explicitly NO user, owner, email, or IP address fields
  },
  {
    timestamps: true,
  }
);

// Index for performant querying by recency and category
confessionSchema.index({ createdAt: -1 });
confessionSchema.index({ category: 1, createdAt: -1 });

module.exports = mongoose.model("Confession", confessionSchema);
