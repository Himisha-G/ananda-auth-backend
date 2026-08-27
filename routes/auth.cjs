const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
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
      expiresIn: "7d",
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
  };
}

/* -----------------------------
   GOOGLE LOGIN
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

    if (!user) {
      user = await User.create({
        googleId,
        email: normalizedEmail,
        name: name || "Ananda User",
        picture: picture || "",
        emailVerified: true,
      });
    } else {
      user.googleId = googleId;
      user.name = name || user.name;
      user.picture = picture || user.picture;
      user.emailVerified = true;

      await user.save();
    }

    const token = createToken(user);

    return res.json({
      token,
      user: publicUser(user),
    });
  } catch (error) {
    console.error("Google authentication error:", error);

    return res.status(401).json({
      message: "Google authentication failed",
    });
  }
});

/* -----------------------------
   EMAIL SIGN UP / REGISTER
   Instant registration without OTP blocker
----------------------------- */

router.post(["/register", "/signup"], async (req, res) => {
  try {
    const { name, email, password } = req.body || {};

    if (!name || !email || !password) {
      return res.status(400).json({
        message: "Name, email and password are required",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        message: "Password must be at least 6 characters",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await User.findOne({
      email: normalizedEmail,
    });

    if (existingUser) {
      return res.status(409).json({
        message: "An account with this email already exists. Please sign in.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await User.create({
      email: normalizedEmail,
      name: name.trim(),
      passwordHash,
      emailVerified: true,
    });

    const token = createToken(user);

    return res.status(201).json({
      message: "Account created successfully",
      token,
      user: publicUser(user),
    });
  } catch (error) {
    console.error("Registration error:", error);

    return res.status(500).json({
      message: error.message || "Could not create account",
    });
  }
});

/* -----------------------------
   EMAIL LOGIN
----------------------------- */

router.post(["/login", "/signin"], async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const user = await User.findOne({
      email: normalizedEmail,
    });

    if (!user) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    if (!user.passwordHash && user.googleId) {
      return res.status(400).json({
        message: "This account was registered with Google. Please use 'Sign in with Google'.",
      });
    }

    if (!user.passwordHash) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    const passwordCorrect = await bcrypt.compare(
      password,
      user.passwordHash
    );

    if (!passwordCorrect) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    const token = createToken(user);

    return res.json({
      message: "Signed in successfully",
      token,
      user: publicUser(user),
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      message: "Login failed",
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
