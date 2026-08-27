const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");


const User = require("../models/User.cjs");

const router = express.Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const JWT_SECRET = process.env.JWT_SECRET;

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

/* -----------------------------
   Helper: create JWT
----------------------------- */

function createToken(user) {
  return jwt.sign(
    {
      userId: user._id.toString(),
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
    emailVerified: user.emailVerified,
  };
}

/* -----------------------------
   GOOGLE LOGIN
----------------------------- */

router.post("/google", async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({
        message: "Google credential is missing",
      });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
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
   EMAIL SIGN UP
----------------------------- */

router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body || {};

    if (!name || !email || !password) {
      return res.status(400).json({
        message: "Name, email and password are required",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: "Password must be at least 8 characters",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await User.findOne({
      email: normalizedEmail,
    });

    if (existingUser) {
      return res.status(409).json({
        message: "An account with this email already exists",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const verificationCode = crypto
      .randomInt(100000, 1000000)
      .toString();

    const verificationCodeHash = crypto
      .createHash("sha256")
      .update(verificationCode)
      .digest("hex");

    const user = await User.create({
      email: normalizedEmail,
      name: name.trim(),
      passwordHash,
      emailVerified: false,
      verificationCodeHash,
      verificationExpiresAt: new Date(
        Date.now() + 10 * 60 * 1000
      ),
    });

    try {
      await sendVerificationEmail(
        normalizedEmail,
        verificationCode
      );
    } catch (emailError) {
      console.error(
        "Verification email failed:",
        emailError
      );

      // Remove the user if email could not be sent.
      // This prevents a half-created account that
      // cannot receive its verification code.
      await User.findByIdAndDelete(user._id);

      return res.status(500).json({
        message:
          "Could not send verification email. Please try again.",
      });
    }

    return res.status(201).json({
      message:
        "Account created. Check your email for the verification code.",
      userId: user._id,
    });
  } catch (error) {
    console.error("Registration error:", error);

    return res.status(500).json({
      message: "Could not create account",
    });
  }
});

/* -----------------------------
   VERIFY EMAIL
----------------------------- */

router.post("/verify-email", async (req, res) => {
  try {
    const { userId, code } = req.body || {};

    if (!userId || !code) {
      return res.status(400).json({
        message: "User ID and verification code are required",
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    if (
      !user.verificationExpiresAt ||
      user.verificationExpiresAt < new Date()
    ) {
      return res.status(400).json({
        message: "Verification code has expired",
      });
    }

    const hashedCode = crypto
      .createHash("sha256")
      .update(code.toString())
      .digest("hex");

    if (hashedCode !== user.verificationCodeHash) {
      return res.status(400).json({
        message: "Invalid verification code",
      });
    }

    user.emailVerified = true;
    user.verificationCodeHash = null;
    user.verificationExpiresAt = null;

    await user.save();

    const token = createToken(user);

    return res.json({
      message: "Email verified successfully",
      token,
      user: publicUser(user),
    });
  } catch (error) {
    console.error("Email verification error:", error);

    return res.status(500).json({
      message: "Could not verify email",
    });
  }
});

/* -----------------------------
   EMAIL LOGIN
----------------------------- */

router.post("/login", async (req, res) => {
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

    if (!user || !user.passwordHash) {
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

    if (!user.emailVerified) {
      return res.status(403).json({
        message: "Please verify your email first",
      });
    }

    const token = createToken(user);

    return res.json({
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
   CURRENT USER
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
   SEND VERIFICATION EMAIL
----------------------------- */

async function sendVerificationEmail(email, code) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: "Ananda <onboarding@resend.dev>",
      to: [email],
      subject: "Your Ananda verification code",
      html: `
        <div style="
          font-family: Arial, sans-serif;
          max-width: 500px;
          margin: 40px auto;
          padding: 30px;
          border-radius: 16px;
          background: #f8f5f0;
        ">
          <h2 style="color: #333;">
            Welcome to Ananda 🌙
          </h2>

          <p style="color: #555;">
            Your Ananda verification code is:
          </p>

          <h1 style="
            letter-spacing: 8px;
            color: #333;
            text-align: center;
          ">
            ${code}
          </h1>

          <p style="color: #777;">
            This code expires in 10 minutes.
          </p>

          <p style="color: #999; font-size: 13px;">
            If you did not create an Ananda account, you can ignore this email.
          </p>
        </div>
      `,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("Resend API error:", data);
    throw new Error(data.message || "Failed to send verification email");
  }

  console.log("Verification email sent:", data.id);

  return data;
}

module.exports = router;
