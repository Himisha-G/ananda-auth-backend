const express = require("express");
const mongoose = require("mongoose");
const Confession = require("../models/Confession.cjs");

const router = express.Router();

function countWords(str) {
  if (!str) return 0;
  return str.trim().split(/\s+/).filter(Boolean).length;
}

// GET /api/confessions
router.get("/", async (req, res) => {
  try {
    const { category, search = "", sortBy = "newest", limit = 100 } = req.query;

    const filter = {};

    if (category && category !== "All") {
      filter.category = category;
    }

    if (search.trim()) {
      filter.text = { $regex: search.trim(), $options: "i" };
    }

    let query = Confession.find(filter);

    if (sortBy === "reactions") {
      // Sort by sum of reactions or by createdAt as secondary
      query = query.sort({
        "reactions.candle": -1,
        "reactions.hug": -1,
        "reactions.support": -1,
        createdAt: -1,
      });
    } else {
      query = query.sort({ createdAt: -1 });
    }

    const confessions = await query.limit(Math.min(parseInt(limit, 10) || 100, 200));

    res.json(confessions);
  } catch (error) {
    console.error("Error fetching confessions:", error);
    res.status(500).json({
      message: "Failed to fetch confessions from the wall",
    });
  }
});

// POST /api/confessions
router.post("/", async (req, res) => {
  try {
    const { text = "", category = "General", color = "#f5e6c8", pinnedStyle = "pin" } = req.body;

    const trimmed = text.trim();

    if (!trimmed) {
      return res.status(400).json({
        message: "Confession cannot be empty",
      });
    }

    const words = countWords(trimmed);
    if (words > 60) {
      return res.status(400).json({
        message: `Confession exceeds the 60-word limit (${words}/60 words). Please shorten your message.`,
      });
    }

    const allowedCategories = [
      "General",
      "GWY Fellowship",
      "Late Night Thoughts",
      "Gratitude & Kindness",
      "Heavy Heart",
    ];

    const safeCategory = allowedCategories.includes(category) ? category : "General";
    const safeStyle = ["pin", "clip", "tape"].includes(pinnedStyle) ? pinnedStyle : "pin";

    // Strictly anonymous - no user info attached
    const confession = await Confession.create({
      text: trimmed,
      category: safeCategory,
      color: typeof color === "string" ? color : "#f5e6c8",
      pinnedStyle: safeStyle,
      reactions: {
        candle: 0,
        hug: 0,
        support: 0,
      },
    });

    res.status(201).json(confession);
  } catch (error) {
    console.error("Error saving confession:", error);
    res.status(500).json({
      message: "Failed to hang your confession on the wall",
    });
  }
});

// POST /api/confessions/:id/react
router.post("/:id/react", async (req, res) => {
  try {
    const { id } = req.params;
    const { type } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid confession ID" });
    }

    const validTypes = ["candle", "hug", "support"];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ message: "Invalid reaction type" });
    }

    const updateField = `reactions.${type}`;
    const updated = await Confession.findByIdAndUpdate(
      id,
      { $inc: { [updateField]: 1 } },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Confession not found" });
    }

    res.json(updated);
  } catch (error) {
    console.error("Error reacting to confession:", error);
    res.status(500).json({
      message: "Failed to update reaction",
    });
  }
});

module.exports = router;
