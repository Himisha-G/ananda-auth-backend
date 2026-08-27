const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");
const nodemailer = require("nodemailer");

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
    emailVerified: user.emailVerified,
  };
}

function getEmailHtml(code) {
  return `
    <div style="
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 500px;
      margin: 40px auto;
      padding: 30px;
      border-radius: 20px;
      background: #0f1426;
      color: #f4efe3;
      border: 1px solid rgba(255, 255, 255, 0.15);
      text-align: center;
    ">
      <div style="font-size: 36px; margin-bottom: 10px;">🌙</div>
      <h2 style="color: #ffffff; margin-bottom: 8px;">
        Welcome to Ananda
      </h2>
      <p style="color: rgba(255, 255, 255, 0.7); font-size: 14px; margin-bottom: 24px;">
        Your sanctuary for peace of mind. Enter this verification code to complete your signup:
      </p>

      <div style="
        letter-spacing: 10px;
        color: #f59e0b;
        font-size: 32px;
        font-weight: bold;
        background: rgba(255, 255, 255, 0.05);
        padding: 16px;
        border-radius: 12px;
        border: 1px dashed rgba(245, 158, 11, 0.4);
        margin: 20px 0;
      ">
        ${code}
      </div>

      <p style="color: rgba(255, 255, 255, 0.5); font-size: 12px; margin-top: 20px;">
        This code expires in 10 minutes.
      </p>

      <p style="color: rgba(255, 255, 255, 0.3); font-size: 11px; margin-top: 30px;">
        If you did not request this code, you can safely ignore this email.
      </p>
    </div>
  `;
}

/* -----------------------------
   SEND VERIFICATION EMAIL
----------------------------- */

async function sendVerificationEmail(email, code) {
  // Option 1: Resend API
  if (process.env.RESEND_API_KEY) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "Ananda <onboarding@resend.dev>",
          to: [email],
          subject: "Your Ananda verification code",
          html: getEmailHtml(code),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log("Verification email sent via Resend:", data.id);
        return data;
      }
    } catch (err) {
      console.warn("Resend email failed:", err.message);
    }
  }

  // Option 2: Nodemailer (SMTP / Gmail / mail.com)
  if (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
    try {
      const isGmail = process.env.EMAIL_USER.includes("gmail.com");
      const transporter = nodemailer.createTransport({
        service: isGmail ? "gmail" : undefined,
        host: process.env.EMAIL_HOST || (isGmail ? "smtp.gmail.com" : "smtp.mail.com"),
        port: Number(process.env.EMAIL_PORT) || 587,
        secure: false,
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD,
        },
      });

      const info = await transporter.sendMail({
        from: `"Ananda" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: "Your Ananda verification code",
        html: getEmailHtml(code),
      });

      console.log("Verification email sent via Nodemailer:", info.messageId);
      return info;
    } catch (err) {
      console.warn("Nodemailer email failed:", err.message);
    }
  }

  // Fallback: Simulation in development mode
  console.log(`\n========================================`);
  console.log(`[ANANDA VERIFICATION CODE for ${email}]: ${code}`);
  console.log(`========================================\n`);
  return { simulated: true, code };
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
        message: "An account with this email already exists",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const verificationCode = crypto
      .randomInt(100000, 1000000)
      .toString();

    const verificationCodeHash = crypto
      .createHash("sha256")
      .update(verificationCode)
      .digest("hex");

    const hasEmailConfig = !!(process.env.RESEND_API_KEY || (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD));

    const user = await User.create({
      email: normalizedEmail,
      name: name.trim(),
      passwordHash,
      emailVerified: !hasEmailConfig, // Auto-verify if no email provider is configured
      verificationCodeHash: hasEmailConfig ? verificationCodeHash : null,
      verificationExpiresAt: hasEmailConfig
        ? new Date(Date.now() + 10 * 60 * 1000)
        : null,
    });

    if (hasEmailConfig) {
      try {
        await sendVerificationEmail(normalizedEmail, verificationCode);
        return res.status(201).json({
          message: "Account created. Check your email for the verification code.",
          requiresVerification: true,
          userId: user._id.toString(),
        });
      } catch (emailError) {
        console.error("Verification email sending failed:", emailError);
        // Don't delete user; auto-verify as graceful fallback
        user.emailVerified = true;
        user.verificationCodeHash = null;
        user.verificationExpiresAt = null;
        await user.save();
      }
    }

    const token = createToken(user);
    return res.status(201).json({
      message: "Account created successfully",
      requiresVerification: false,
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
   VERIFY EMAIL
----------------------------- */

router.post(["/verify-email", "/verify"], async (req, res) => {
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
        requiresVerification: true,
        userId: user._id.toString(),
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
   LOGOUT
----------------------------- */

router.post("/logout", (req, res) => {
  return res.json({
    success: true,
    message: "Logged out successfully",
  });
});

module.exports = router;
