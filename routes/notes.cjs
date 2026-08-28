const express = require("express");
const Note = require("../models/Note.cjs");

const router = express.Router();

// GET /api/notes
router.get("/", async (req, res) => {
  try {
    const {
      search = "",
      archived = "false",
      trashed = "false",
    } = req.query;

    const filter = {
      isArchived: archived === "true",
      isTrashed: trashed === "true",
    };

    if (search.trim()) {
      filter.$or = [
        { title: { $regex: search.trim(), $options: "i" } },
        { body: { $regex: search.trim(), $options: "i" } },
      ];
    }

    const notes = await Note.find(filter).sort({
      isPinned: -1,
      createdAt: -1,
    });

    res.json(notes);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to fetch notes",
    });
  }
});

// POST /api/notes
router.post("/", async (req, res) => {
  try {
    const { title = "", body = "", color } = req.body;

    if (!title.trim() && !body.trim()) {
      return res.status(400).json({
        message: "Note cannot be empty",
      });
    }

    const note = await Note.create({
      title: title.trim(),
      body: body.trim(),
      color,
    });

    res.status(201).json(note);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to create note",
    });
  }
});

// PATCH /api/notes/:id
router.patch("/:id", async (req, res) => {
  try {
    const note = await Note.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!note) {
      return res.status(404).json({
        message: "Note not found",
      });
    }

    res.json(note);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to update note",
    });
  }
});

// DELETE /api/notes/:id
router.delete("/:id", async (req, res) => {
  try {
    const hardDelete = req.query.hard === "true";

    // Permanent delete
    if (hardDelete) {
      const deleted = await Note.findByIdAndDelete(req.params.id);

      if (!deleted) {
        return res.status(404).json({
          message: "Note not found",
        });
      }

      return res.json({
        message: "Note permanently deleted",
      });
    }

    // Soft delete → trash
    const note = await Note.findByIdAndUpdate(
      req.params.id,
      {
        isTrashed: true,
        isArchived: false,
      },
      { new: true }
    );

    if (!note) {
      return res.status(404).json({
        message: "Note not found",
      });
    }

    res.json(note);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to delete note",
    });
  }
});

module.exports = router;