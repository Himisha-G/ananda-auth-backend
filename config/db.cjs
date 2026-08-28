const mongoose = require("mongoose");
const Note = require("../models/Note.cjs");
const Confession = require("../models/Confession.cjs");
const User = require("../models/User.cjs");

async function connectDB() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error("❌ MONGODB_URI is not set in environment variables");
    process.exit(1);
  }

  const dbName = process.env.MONGODB_DB || "mehackdora";

  try {
    await mongoose.connect(uri, {
      dbName,
    });
    console.log(`✅ MongoDB connected successfully to database: ${dbName}`);

    // Ensure collections exist
    await Promise.all([
      Confession.createCollection().catch(() => {}),
      Note.createCollection().catch(() => {}),
      User.createCollection().catch(() => {}),
    ]);
    console.log("✅ MongoDB collections ('confessions', 'notes', 'users') initialized and ready.");
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err.message);
    process.exit(1);
  }
}

module.exports = connectDB;
