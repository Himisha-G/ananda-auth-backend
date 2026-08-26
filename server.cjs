require("dotenv").config();

const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db.cjs");

const app = express();

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json({ limit: "2mb" }));

connectDB();

app.use("/api/notes", require("./routes/notes.cjs"));
app.use("/api/auth", require("./routes/auth.cjs"));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`);
});
