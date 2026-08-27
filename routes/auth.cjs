const express = require("express");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");

const User = require("../models/User.cjs");

const router = express.Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const JWT_SECRET = process.env.JWT_SECRET || "heyheyheylalalala";

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

/* -----------------------------
   Helper: create JWT
----------------------------- */

function createToken(user) {
  return jwt.sign(
    {
      userId: user._id.toString(),
      email: user.email,
    },
    JWT_SECRET,
    {
      expiresIn: "30d",
    }
  );
}

/* -----------------------------
   Helper: public user object
----------------------------- */

function publicUser(user) {
  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    picture: user.picture || "",
    avatar: user.picture || "",
    emailVerified: user.emailVerified !== false,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

/* -----------------------------
   GOOGLE LOGIN / REGISTRATION
----------------------------- */

router.post("/google", async (req, res) => {
  try {
    const { credential, token: altToken } = req.body || {};
    const idToken = credential || altToken;

    if (!idToken) {
      return res.status(400).json({
        message: "Google credential is missing",
      });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: idToken,
      audience: GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    if (!payload) {
      return res.status(401).json({
        message: "Invalid Google credential",
      });
    }

    const {
      sub: googleId,
      email,
      name,
      picture,
      email_verified,
    } = payload;

    if (!email || !email_verified) {
      return res.status(401).json({
        message: "Google account email is not verified",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    let user = await User.findOne({
      email: normalizedEmail,
    });

    let isNewUser = false;

    if (!user) {
      user = await User.create({
        googleId,
        email: normalizedEmail,
        name: name || "Ananda Villager",
        picture: picture || "",
        emailVerified: true,
      });
      isNewUser = true;
    } else {
      user.googleId = googleId;
      if (!user.name || user.name === "Ananda User") {
        user.name = name || user.name;
      }
      if (picture && (!user.picture || user.picture.includes("googleusercontent.com"))) {
        user.picture = picture;
      }
      user.emailVerified = true;
      await user.save();
    }

    const token = createToken(user);
    const totalUsers = await User.countDocuments();

    return res.json({
      message: isNewUser ? "Welcome to Ananda!" : "Welcome back to Ananda!",
      token,
      user: publicUser(user),
      isNewUser,
      totalUsers,
    });
  } catch (error) {
    console.error("Google authentication error:", error);

    return res.status(401).json({
      message: error.message || "Google authentication failed",
    });
  }
});

/* -----------------------------
   UPDATE PROFILE (Edit Name)
----------------------------- */

router.patch("/profile", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const { name, picture } = req.body || {};

    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Name cannot be empty" });
    }

    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.name = name.trim();
    if (picture) user.picture = picture;
    await user.save();

    return res.json({
      message: "Profile updated successfully",
      user: publicUser(user),
    });
  } catch (error) {
    return res.status(401).json({
      message: error.message || "Failed to update profile",
    });
  }
});

/* -----------------------------
   GET STATS (Unique Users Count)
----------------------------- */

router.get("/stats", async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    return res.json({
      totalUsers,
      status: "ok",
    });
  } catch (error) {
    return res.status(500).json({
      totalUsers: 1,
      error: error.message,
    });
  }
});

/* -----------------------------
   CURRENT USER (/me)
----------------------------- */

router.get("/me", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Not authenticated",
      });
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, JWT_SECRET);

    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({
        message: "User not found",
      });
    }

    return res.json({
      user: publicUser(user),
    });
  } catch (error) {
    return res.status(401).json({
      message: "Invalid or expired token",
    });
  }
});

/* -----------------------------
   LOGOUT
----------------------------- */

router.post("/logout", (req, res) => {
  return res.json({
    success: true,
    message: "Logged out successfully",
  });
});

module.exports = router;
