require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 3000;
// const admin = require("firebase-admin");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

// Comma-separated list in env (recommended on Vercel):
// CLIENT_ORIGINS=https://learnandearned.netlify.app,http://localhost:5173
const envOrigins = (process.env.CLIENT_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Safe defaults for local dev + your Netlify domain
const defaultWhitelist = [
  "http://localhost:5173",
  "https://learnandearned.netlify.app",
  "https://learnandearned.vercel.app",
  "https://www.learnandearned.xyz",
  "https://learnandearned.xyz",
];

const whitelist = new Set([...defaultWhitelist, ...envOrigins]);

const corsOptions = {
  origin: (origin, cb) => {
    // Allow server-to-server, curl, Postman (no origin header)
    if (!origin) return cb(null, true);

    // Explicitly allow any origin in the whitelist
    if (whitelist.has(origin)) return cb(null, true);

    // Optionally allow your preview subdomains on Netlify (uncomment if needed)
    // if (/^https:\/\/.*--learnandearned\.netlify\.app$/.test(origin)) return cb(null, true);

    return cb(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true, // so cookies/Authorization can be sent
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
// Handle preflight for all routes
// app.options("*", cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const otpStore = new Map();

app.get("/", (req, res) => {
  res.send("Learn and Earn is running..");
});

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.hlucnuf.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// Create Database
const usersCollection = client.db("learnNfunDB").collection("users");
const paymentsCollection = client.db("learnNfunDB").collection("payments");
const withdrawalsCollection = client
  .db("learnNfunDB")
  .collection("withdrawals");
const coursesCollection = client.db("learnNfunDB").collection("courses");
const videosCollection = client.db("learnNfunDB").collection("videos");

// Nodemailer otp sending..

app.post("/send-otp", async (req, res) => {
  const { email } = req.body;
  if (!email)
    return res.status(400).json({ success: false, message: "Email required" });

  // Generate 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  // Setup Nodemailer transporter (example with Gmail SMTP)
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: "OTP Code",
    text: `Your OTP is: ${otp}. It will expire in 5 minutes.`,
  };

  try {
    await transporter.sendMail(mailOptions);

    // Save OTP with expiration (store in memory for demo)
    otpStore.set(email, { otp, expiresAt: Date.now() + 10 * 60 * 1000 });

    res.json({ success: true, otp }); // send OTP for demo, remove in prod!
  } catch (error) {
    console.error("Error sending email:", error);
    res.status(500).json({ success: false, message: "Failed to send OTP" });
  }
});

// Optional: API to verify OTP on backend (better than frontend compare)
app.post("/verify-otp", (req, res) => {
  const { email, otp } = req.body;
  const record = otpStore.get(email);

  if (!record)
    return res.status(400).json({ success: false, message: "No OTP sent" });
  if (record.expiresAt < Date.now()) {
    otpStore.delete(email);
    return res.status(400).json({ success: false, message: "OTP expired" });
  }

  if (record.otp !== otp) {
    return res.status(400).json({ success: false, message: "Invalid OTP" });
  }

  otpStore.delete(email); // OTP used, remove it
  res.json({ success: true, message: "OTP verified" });
});

// JWT token verify
const jwt = require("jsonwebtoken");

const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader)
    return res.status(401).send({ error: "Unauthorized access" });

  const token = authHeader.split(" ")[1];
  // console.log("JWT token:", token);

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).send({ error: "Forbidden" });
    req.user = decoded;
    next();
  });
};
// your JWT secret
const jwtSecret = process.env.JWT_SECRET;

// Create a token and send it to client
app.post("/jwt", (req, res) => {
  const user = req.body;
  const token = jwt.sign(user, jwtSecret, { expiresIn: "3d" });
  res.send({ token });
});

// Middleware to verify admin
const verifyAdmin = async (req, res, next) => {
  const userEmail = req.user.email;
  const user = await usersCollection.findOne({ email: userEmail });
  if (!user || user.role !== "admin") {
    return res.status(403).send({ error: "Forbidden - Admins only" });
  }
  next();
};

async function run() {
  try {
    // Start Mongo connection in background; register routes immediately
    client
      .connect()
      .then(() => console.log("MongoDB connected"))
      .catch((e) => console.error("Mongo connect error:", e));

    // for missing users referral code and link setup
    async function addMissingReferralCodes() {
      const usersWithoutCode = await usersCollection
        .find({ referralCode: { $exists: false } })
        .toArray();

      for (const user of usersWithoutCode) {
        const newCode = generateReferralCode(); // your existing function
        await usersCollection.updateOne(
          { _id: user._id },
          { $set: { referralCode: newCode } }
        );
        console.log(`Set referralCode for user ${user.email} to ${newCode}`);
      }
    }

    function generateReferralCode() {
      return crypto.randomBytes(4).toString("hex").toUpperCase();
    }

    // Ensure all existing users have a referralCode, then index it for fast lookups
    // Run in background so it doesn't block route registration on cold starts
    addMissingReferralCodes()
      .then(() =>
        usersCollection.createIndex(
          { referralCode: 1 },
          { unique: true, sparse: true }
        )
      )
      .catch((e) =>
        console.warn("Referral code backfill/index warning:", e?.message || e)
      );

    // signup user with reffer
    app.post("/users", async (req, res) => {
      const { email: inputEmail, name, phone, photoURL, referredBy } = req.body;
      if (!inputEmail)
        return res.status(400).send({ error: "Email is required" });

      const email = inputEmail.toString().trim().toLowerCase();

      // Check if user already exists
      const existingUser = await usersCollection.findOne({ email });
      if (existingUser) {
        const token = jwt.sign({ email }, jwtSecret, { expiresIn: "3d" });
        return res.status(200).send({ message: "User already exists", token });
      }

      // Generate new referral code
      const referralCode = generateReferralCode();

      // New user object
      const newUser = {
        name,
        email,
        role: "user",
        phone,
        photoURL,
        referralCode,
        referredBy: referredBy || null, // store inviter's referralCode here
        teamMembers: [],
        createdAt: new Date(),
      };

      // Insert user
      const result = await usersCollection.insertOne(newUser);

      // If referredBy exists, update inviter’s teamMembers with THIS USER’s _id
      if (referredBy) {
        const inviter = await usersCollection.findOne({
          referralCode: referredBy,
        });
        if (inviter) {
          await usersCollection.updateOne(
            { referralCode: referredBy },
            { $push: { teamMembers: result.insertedId } }
          );
        }
      }

      const token = jwt.sign({ email }, jwtSecret, { expiresIn: "3d" });

      res.status(201).send({
        message: "User registered successfully",
        referralLink: `${process.env.CLIENT_URL}/auth/signup?ref=${referralCode}`,
        token,
      });
    });

    // Update user image
    app.patch("/users/update-photo", verifyToken, async (req, res) => {
      const { email, photoURL } = req.body;
      const result = await usersCollection.updateOne(
        { email },
        { $set: { photoURL } }
      );
      res.send({ success: true, result });
    });

    // Rollback route
    app.delete("/users/:email", async (req, res) => {
      const { email } = req.params;
      const usersCollection = client.db("learnNfunDB").collection("users");
      await usersCollection.deleteOne({ email });
      res.send({ message: "User rolled back successfully" });
    });

    // // get user role (path version)
    // app.get("/users/:email/role", async (req, res) => {
    //   try {
    //     const raw = req.params.email || "";
    //     const email = decodeURIComponent(raw).trim().toLowerCase();

    //     if (!email) return res.status(400).json({ error: "Email required" });

    //     const user = await usersCollection.findOne(
    //       { email },
    //       { projection: { role: 1, _id: 0 } }
    //     );

    //     // Return a safe default to avoid client error loops
    //     if (!user) return res.json({ role: "user" });

    //     res.json({ role: user.role || "user" });
    //   } catch (err) {
    //     console.error("GET /users/:email/role error:", err);
    //     res.status(500).json({ error: "Internal Server Error" });
    //   }
    // });

    // get user role (query alias)
    // get user role (query alias: email OR referralCode)
    app.get("/users/role", async (req, res) => {
      try {
        const emailRaw = (req.query.email || "").toString();
        const codeRaw = (req.query.referralCode || "").toString();

        const email = decodeURIComponent(emailRaw).trim().toLowerCase();
        const referralCode = decodeURIComponent(codeRaw).trim().toUpperCase();

        if (!email && !referralCode) {
          return res
            .status(400)
            .json({ error: "Provide email or referralCode" });
        }

        // Build the lookup query
        let query = {};
        if (email && referralCode) {
          // If both are provided, ensure they refer to the same record
          query = { email, referralCode };
        } else if (email) {
          query = { email };
        } else {
          query = { referralCode };
        }

        const user = await usersCollection.findOne(query, {
          projection: { role: 1, _id: 0, email: 1, referralCode: 1 },
        });

        // If both were provided but no single record matches both, check for a mismatch to give a clearer error
        if (email && referralCode && !user) {
          // Try to detect which part didn't match to help the client
          const byEmail = await usersCollection.findOne(
            { email },
            { projection: { _id: 1 } }
          );
          const byCode = await usersCollection.findOne(
            { referralCode },
            { projection: { _id: 1 } }
          );
          if (byEmail && byCode) {
            return res.status(400).json({
              error: "email and referralCode refer to different users",
            });
          }
        }

        // Default role is "user" if not found
        const role = user?.role || "user";
        return res.json({ role });
      } catch (err) {
        console.error("GET /users/role error:", err);
        return res.status(500).json({ error: "Internal Server Error" });
      }
    });

    // get user role (path alias to avoid client changes)
    // get user role (path alias: /users/role/:identifier where identifier = email OR referralCode)
    app.get("/users/role/:identifier", async (req, res) => {
      try {
        const raw = req.params.identifier || "";
        const id = decodeURIComponent(raw).trim();

        if (!id) return res.status(400).json({ error: "Identifier required" });

        // Heuristic: if it looks like an email (has '@'), treat as email; otherwise treat as referralCode
        const isEmail = id.includes("@");

        const query = isEmail
          ? { email: id.toLowerCase() }
          : { referralCode: id.toUpperCase() };

        const user = await usersCollection.findOne(query, {
          projection: { role: 1, _id: 0 },
        });

        return res.json({ role: user?.role || "user" });
      } catch (err) {
        console.error("GET /users/role/:identifier error:", err);
        return res.status(500).json({ error: "Internal Server Error" });
      }
    });

    // get user profile
    app.get("/my-profile", verifyToken, async (req, res) => {
      try {
        const email = (req.user?.email || "").trim().toLowerCase();
        if (!email)
          return res.status(400).send({ error: "Email missing in token" });

        const user = await usersCollection.findOne({ email });
        if (!user) return res.status(404).send({ error: "User not found" });

        // Ensure referralCode exists (generate once if missing)
        let ensuredReferralCode = user.referralCode;
        if (!ensuredReferralCode) {
          ensuredReferralCode = generateReferralCode();
          await usersCollection.updateOne(
            { email },
            { $set: { referralCode: ensuredReferralCode } }
          );
        }

        // Populate referrer details if referredBy exists
        let referrer = null;
        if (user.referredBy) {
          referrer = await usersCollection.findOne(
            { referralCode: user.referredBy },
            { projection: { name: 1, email: 1, _id: 0 } }
          );
        }

        // Build a safe response (avoid mutating DB doc)
        const { password, _id, ...rest } = user;

        res.send({
          ...rest,
          referralCode: ensuredReferralCode, // permanent main code
          tokens: user.tokens ?? 0,
          referrer,
        });
      } catch (err) {
        // console.error("GET /my-profile error:", err);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    // get team data
    app.get("/my-team", verifyToken, async (req, res) => {
      try {
        const email = (req.user?.email || "").trim().toLowerCase();
        const usersCollection = client.db("learnNfunDB").collection("users");

        const user = await usersCollection.findOne({ email });
        if (!user) return res.status(404).send({ error: "User not found" });

        const rawMembers = Array.isArray(user.teamMembers)
          ? user.teamMembers
          : [];
        // Normalize to ObjectId[] safely
        const toObjectId = (v) => {
          try {
            return typeof v === "string" ? new ObjectId(v) : v;
          } catch (_) {
            return null;
          }
        };
        const memberIds = rawMembers.map(toObjectId).filter(Boolean);

        if (!memberIds.length) return res.send({ team: [] });

        const team = await usersCollection
          .find({ _id: { $in: memberIds } })
          .project({ name: 1, email: 1, _id: 0 })
          .toArray();

        res.send({ team });
      } catch (error) {
        console.error("Error in /my-team:", error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    // GET all users with role "user" (pending)
    app.get("/pending-users", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const users = await usersCollection
          .find({ role: "user" }) // only initial users
          .project({ name: 1, email: 1, _id: 0 })
          .toArray();
        res.send(users);
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Failed to fetch pending users" });
      }
    });

    // PATCH: Approve pending user & reward referrer
    app.patch(
      "/pending-users/:email/approve",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const { email } = req.params;
          if (!email) {
            return res.status(400).json({
              success: false,
              message: "Email required",
            });
          }

          // Fetch user
          const user = await usersCollection.findOne({ email });
          if (!user) {
            return res.status(404).json({
              success: false,
              message: "User not found",
            });
          }

          const joinDate = new Date();
          const unlockDate = new Date(joinDate);
          unlockDate.setDate(unlockDate.getDate() + 3);

          const updateData = {
            role: "member",
            freePlaysLeft: 2,
            playsCount: 0,
            balance: 400,
            profits: 0,
            tokens: 0,
            joinDate,
            locked: false,
            dailyFreePlaysUsed: 0,
            lastFreePlay: null,
            unlockDate,
          };

          // Approve user
          await usersCollection.updateOne({ email }, { $set: updateData });

          //  Reward referrer
          if (user.referredBy) {
            const referrerResult = await usersCollection.updateOne(
              { referralCode: user.referredBy },
              { $inc: { tokens: 1 } }
            );

            if (referrerResult.matchedCount === 0) {
              console.warn("Referrer not found for code:", user.referredBy);
            }
          }

          return res.json({
            success: true,
            message: "User approved successfully and referrer rewarded",
          });
        } catch (error) {
          console.error("APPROVAL ERROR:", error);
          return res.status(500).json({
            success: false,
            message: "Server error, please try again later",
          });
        }
      }
    );

    // GET all members
    app.get("/members", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const members = await usersCollection
          .find({ role: "member" })
          .project({ name: 1, email: 1, _id: 0, photoURL: 1, phone: 1 })
          .toArray();
        res.send(members);
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Failed to fetch members" });
      }
    });

    // GET single member profile by email
    // Get full member profile by email (Admin)
    app.get(
      "/members/profile/:email",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const { email } = req.params;

        try {
          const member = await usersCollection.findOne({
            email,
            role: "member",
          });
          if (!member)
            return res.status(404).send({ error: "Member not found" });

          // Ensure referralCode exists
          if (!member.referralCode) {
            const referralCode = generateReferralCode();
            await usersCollection.updateOne(
              { email },
              { $set: { referralCode } }
            );
            member.referralCode = referralCode;
          }

          // Populate referrer details if referredBy exists
          let referrer = null;
          if (member.referredBy) {
            referrer = await usersCollection.findOne(
              { referralCode: member.referredBy },
              { projection: { name: 1, email: 1, _id: 0 } }
            );
          }

          // Populate team members
          let team = [];
          if (
            Array.isArray(member.teamMembers) &&
            member.teamMembers.length > 0
          ) {
            team = await usersCollection
              .find({ _id: { $in: member.teamMembers } })
              .project({ name: 1, email: 1, _id: 0 })
              .toArray();
          }

          // Remove sensitive info
          delete member.password;
          delete member._id;

          res.send({
            ...member,
            referrer, // who referred this member
            team, // team members details
          });
        } catch (error) {
          console.error(error);
          res.status(500).send({ error: "Failed to fetch member profile" });
        }
      }
    );

    // Submit payment info
    app.post("/payments", verifyToken, async (req, res) => {
      try {
        const { name, email, phone, screenshot, status, date } = req.body;

        if (!name || !email || !phone || !screenshot) {
          return res
            .status(400)
            .json({ success: false, message: "All fields are required" });
        }

        const paymentDoc = {
          name,
          email,
          phone,
          screenshot, // URL from frontend
          status: status || "pending", // default status
          date: date ? new Date(date) : new Date(),
        };

        const result = await paymentsCollection.insertOne(paymentDoc);

        res.json({
          success: true,
          message: "Payment submitted",
          insertedId: result.insertedId,
        });
      } catch (error) {
        console.error(error);
        res
          .status(500)
          .json({ success: false, message: "Failed to submit payment" });
      }
    });

    // get payment info
    app.get("/payments", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const payments = await paymentsCollection.find({}).toArray();
        res.json(payments);
      } catch (error) {
        console.error(error);
        res
          .status(500)
          .json({ success: false, message: "Failed to fetch payments" });
      }
    });

    // Update payment status
    app.patch("/payments/:id", verifyToken, verifyAdmin, async (req, res) => {
      const { id } = req.params;
      const { status } = req.body;
      try {
        const paymentsCollection = client
          .db("learnNfunDB")
          .collection("payments");
        const result = await paymentsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status } }
        );
        if (result.modifiedCount === 1) {
          res.json({ success: true, message: "Payment status updated" });
        } else {
          res.status(400).json({ success: false, message: "Update failed" });
        }
      } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server error" });
      }
    });

    // Lottery Free Play (fixed to return useful data and decrement freePlaysLeft)
    app.post("/lottery/play-free", async (req, res) => {
      try {
        const { email } = req.body;
        if (!email) return res.status(400).send({ success: false });

        const user = await usersCollection.findOne({ email });
        if (!user) return res.status(404).send({ success: false });

        const now = new Date();

        // 🔒 Unlock check
        if (!user.unlockDate || new Date(user.unlockDate) < now) {
          return res.status(403).send({
            success: false,
            message: "Game access expired. Unlock again!",
          });
        }

        // 🕒 Daily limit
        const last = user.lastFreePlay ? new Date(user.lastFreePlay) : null;
        let used = user.dailyFreePlaysUsed || 0;

        if (!last || now - last > 24 * 60 * 60 * 1000) {
          used = 0;
        }

        if (used >= 3) {
          return res.send({
            success: false,
            message: "Daily play limit reached",
            remainingPlays: 0,
          });
        }

        // 🎰 Slot logic
        const icons = ["🍒", "🍋", "⭐", "💎", "🍇", "🍊", "7️⃣"];
        let slots = Array.from(
          { length: 3 },
          () => icons[Math.floor(Math.random() * icons.length)]
        );

        let win = Math.random() < 0.4;
        if (win) slots = ["💎", "💎", "💎"];

        const reward = win ? 20 : 0;

        await usersCollection.updateOne(
          { email },
          {
            $set: {
              lastFreePlay: now,
              dailyFreePlaysUsed: used + 1,
            },
            ...(win && { $inc: { balance: reward, profits: reward } }),
          }
        );

        return res.send({
          success: true,
          win,
          reward,
          slots,
          remainingPlays: 3 - (used + 1),
          message: win ? "🎉 You WIN +20!" : "Try again!",
        });
      } catch (err) {
        console.error(err);
        res.status(500).send({ success: false });
      }
    });

    // DINO Play (ensure returns newBalance + dailyPlaysUsed)
    app.post("/dinogame/play", async (req, res) => {
      try {
        const { email, score } = req.body;

        if (!email || typeof score !== "number" || score < 0) {
          return res.status(400).send({
            success: false,
            message: "Valid email and score are required",
          });
        }

        const user = await usersCollection.findOne({ email });
        if (!user) {
          return res.status(404).send({
            success: false,
            message: "User not found",
          });
        }

        const now = new Date();

        // 🔒 Access check
        if (!user.unlockDate || new Date(user.unlockDate) <= now) {
          return res.status(403).send({
            success: false,
            message: "Dino access expired. Unlock games to continue playing!",
          });
        }

        // 🗓️ Daily reset (UTC midnight)
        const todayUTC = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
        );

        let dailyUsed = user.dailyDinoPlaysUsed || 0;
        const lastPlay = user.lastDinoPlay ? new Date(user.lastDinoPlay) : null;

        if (!lastPlay || lastPlay < todayUTC) {
          dailyUsed = 0;
        }

        if (dailyUsed >= 3) {
          return res.status(403).send({
            success: false,
            message: "Daily Dino limit reached",
            remainingPlays: 0,
          });
        }

        // 🛡️ Anti-abuse (score clamp)
        const SAFE_MAX_SCORE = 20000; // ≈ max humanly possible
        const safeScore = Math.min(score, SAFE_MAX_SCORE);

        // 🎁 Reward logic
        const reward = Math.min(Math.floor(safeScore / 1000), 20);

        // 🔄 Atomic update
        const result = await usersCollection.findOneAndUpdate(
          { email },
          {
            $set: {
              lastDinoPlay: now,
              dailyDinoPlaysUsed: dailyUsed + 1,
            },
            $inc: {
              balance: reward,
              profits: reward,
            },
          },
          {
            returnDocument: "after",
            projection: {
              balance: 1,
              dailyDinoPlaysUsed: 1,
              unlockDate: 1,
            },
          }
        );

        const updated = result.value;

        return res.send({
          success: true,
          reward,
          newBalance: updated.balance,
          dailyPlaysUsed: updated.dailyDinoPlaysUsed,
          remainingPlays: 3 - updated.dailyDinoPlaysUsed,
          message: `🎉 You earned ${reward} Taka`,
          unlockDate: updated.unlockDate,
        });
      } catch (err) {
        console.error("DINO PLAY ERROR:", err);
        res.status(500).send({
          success: false,
          message: "Server error. Please try again.",
        });
      }
    });

    // Unlock games API
    app.post("/games/unlock", async (req, res) => {
      const { email } = req.body;
      const COST = 4;
      const DAYS = 14;

      const user = await usersCollection.findOne({ email });
      if (!user || user.tokens < COST) {
        return res.status(403).send({ success: false });
      }

      const now = new Date();
      const base =
        user.unlockDate && new Date(user.unlockDate) > now
          ? new Date(user.unlockDate)
          : now;

      const unlockDate = new Date(base.getTime() + DAYS * 86400000);

      await usersCollection.updateOne(
        { email },
        { $inc: { tokens: -COST }, $set: { unlockDate } }
      );

      res.send({
        success: true,
        unlockDate,
        message: "Games unlocked for 14 days!",
      });
    });

    // Withdraw request API (member side)
    app.post("/withdraw", verifyToken, async (req, res) => {
      try {
        const email = req.user?.email;
        const { amount, phone, method } = req.body;

        if (!email) return res.status(401).json({ message: "Unauthorized" });
        if (amount <= 20)
          return res.status(400).json({ message: "Invalid amount" });
        if (!phone || phone.length < 11) {
          return res
            .status(400)
            .json({ message: "Valid phone number required" });
        }
        if (!method || !["bkash", "nagad"].includes(method.toLowerCase())) {
          return res
            .status(400)
            .json({ message: "Payment method must be bKash or Nagad" });
        }

        const user = await usersCollection.findOne({ email });
        if (!user) return res.status(404).json({ message: "User not found" });

        if (user.balance < amount) {
          return res.status(400).json({ message: "Insufficient balance" });
        }

        // Create withdrawal request object
        const withdrawalRequest = {
          userId: user._id,
          email: user.email,
          name: user.name,
          phone,
          method: method.toLowerCase(), // "bkash" or "nagad"
          amount,
          status: "pending", // pending | approved | rejected
          createdAt: new Date(),
        };

        // Store in withdrawals collection
        await withdrawalsCollection.insertOne(withdrawalRequest);

        // (Optional) Deduct balance immediately OR wait for admin approval
        // await usersCollection.updateOne(
        //   { _id: user._id },
        //   { $inc: { balance: -amount } }
        // );

        res.json({
          success: true,
          message: "Withdraw request submitted for admin approval",
        });
      } catch (err) {
        console.error("Withdraw error:", err);
        res.status(500).json({ message: "Server error" });
      }
    });

    app.get("/withdrawals", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const withdrawals = await withdrawalsCollection
          .find()
          .sort({ createdAt: -1 })
          .toArray();
        res.json(withdrawals);
      } catch (err) {
        res
          .status(500)
          .json({ message: "Failed to fetch withdrawal requests" });
      }
    });

    // Approve
    app.patch(
      "/withdrawals/:id/approve",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const { id } = req.params;

        try {
          const withdrawal = await withdrawalsCollection.findOne({
            _id: new ObjectId(id),
          });
          if (!withdrawal)
            return res.status(404).json({ message: "Request not found" });
          if (withdrawal.status !== "pending") {
            return res.status(400).json({ message: "Already processed" });
          }

          // Deduct balance from user
          const result = await usersCollection.updateOne(
            { email: withdrawal.email },
            { $inc: { balance: -withdrawal.amount } }
          );

          if (result.modifiedCount > 0) {
            await withdrawalsCollection.updateOne(
              { _id: new ObjectId(id) },
              { $set: { status: "approved", approvedAt: new Date() } }
            );
            return res.json({ success: true, message: "Withdrawal approved" });
          } else {
            return res
              .status(400)
              .json({ message: "Failed to update user balance" });
          }
        } catch (err) {
          console.error(err);
          res.status(500).json({ message: "Server error" });
        }
      }
    );

    // Reject
    app.patch(
      "/withdrawals/:id/reject",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const { id } = req.params;

        try {
          const withdrawal = await withdrawalsCollection.findOne({
            _id: new ObjectId(id),
          });
          if (!withdrawal)
            return res.status(404).json({ message: "Request not found" });
          if (withdrawal.status !== "pending") {
            return res.status(400).json({ message: "Already processed" });
          }

          await withdrawalsCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { status: "rejected", rejectedAt: new Date() } }
          );

          res.json({ success: true, message: "Withdrawal rejected" });
        } catch (err) {
          console.error(err);
          res.status(500).json({ message: "Server error" });
        }
      }
    );

    // Ensure unique course.key
    await coursesCollection.createIndex({ key: 1 }, { unique: true });

    /**
     * PUBLIC (or protected) – list courses
     */
    app.get("/courses", verifyToken, async (req, res) => {
      try {
        const courses = await coursesCollection
          .find({})
          .project({ name: 1, key: 1, createdAt: 1 })
          .toArray();
        res.send(courses);
      } catch (e) {
        console.error(e);
        res.status(500).send({ error: "Failed to fetch courses" });
      }
    });

    /**
     * PUBLIC (or protected) – list videos of a course
     * /videos?courseKey=web-design
     */
    app.get("/videos", verifyToken, async (req, res) => {
      try {
        const { courseKey } = req.query;
        if (!courseKey) {
          return res.status(400).send({ error: "courseKey is required" });
        }
        const videos = await videosCollection
          .find({ courseKey })
          .project({ title: 1, yt: 1, order: 1, createdAt: 1 })
          .sort({ order: 1, createdAt: 1 })
          .toArray();
        res.send(videos);
      } catch (e) {
        console.error(e);
        res.status(500).send({ error: "Failed to fetch videos" });
      }
    });

    /**
     * ADMIN – create course
     * body: { key, name }
     */
    app.post("/courses", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const { key, name } = req.body;
        if (!key || !name)
          return res.status(400).send({ error: "key & name required" });

        const doc = { key, name, createdAt: new Date() };
        const result = await coursesCollection.insertOne(doc);
        res.send({ success: true, insertedId: result.insertedId });
      } catch (e) {
        if (e?.code === 11000) {
          return res.status(409).send({ error: "Course key already exists" });
        }
        console.error(e);
        res.status(500).send({ error: "Failed to create course" });
      }
    });

    /**
     * ADMIN – update course
     * params: id
     * body: { name }
     */
    app.patch("/courses/:id", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const { id } = req.params;
        const { name } = req.body;
        if (!name) return res.status(400).send({ error: "name is required" });

        const result = await coursesCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { name } }
        );
        res.send({ success: result.modifiedCount > 0 });
      } catch (e) {
        console.error(e);
        res.status(500).send({ error: "Failed to update course" });
      }
    });

    /**
     * ADMIN – delete course (also deletes its videos)
     */
    app.delete("/courses/:id", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const { id } = req.params;
        const course = await coursesCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!course) return res.status(404).send({ error: "Course not found" });

        await videosCollection.deleteMany({ courseKey: course.key });
        const result = await coursesCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.send({ success: result.deletedCount > 0 });
      } catch (e) {
        console.error(e);
        res.status(500).send({ error: "Failed to delete course" });
      }
    });

    /**
     * ADMIN – create video
     * body: { courseKey, title, yt, order? }
     */
    app.post("/videos", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const { courseKey, title, yt, order } = req.body;
        if (!courseKey || !title || !yt) {
          return res
            .status(400)
            .send({ error: "courseKey, title, yt required" });
        }
        // ensure course exists
        const course = await coursesCollection.findOne({ key: courseKey });
        if (!course) return res.status(404).send({ error: "Course not found" });

        const doc = {
          courseKey,
          title,
          yt,
          order: typeof order === "number" ? order : 9999,
          createdAt: new Date(),
        };
        const result = await videosCollection.insertOne(doc);
        res.send({ success: true, insertedId: result.insertedId });
      } catch (e) {
        console.error(e);
        res.status(500).send({ error: "Failed to create video" });
      }
    });

    /**
     * ADMIN – update video
     * params: id
     * body: { title?, yt?, order? }
     */
    app.patch("/videos/:id", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const { id } = req.params;
        const payload = {};
        ["title", "yt", "order"].forEach((k) => {
          if (req.body[k] !== undefined) payload[k] = req.body[k];
        });
        if (!Object.keys(payload).length) {
          return res.status(400).send({ error: "Nothing to update" });
        }
        const result = await videosCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: payload }
        );
        res.send({ success: result.modifiedCount > 0 });
      } catch (e) {
        console.error(e);
        res.status(500).send({ error: "Failed to update video" });
      }
    });

    /* ADMIN – delete video */

    app.delete("/videos/:id", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const { id } = req.params;
        const result = await videosCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.send({ success: result.deletedCount > 0 });
      } catch (e) {
        console.error(e);
        res.status(500).send({ error: "Failed to delete video" });
      }
    });

    // 1. Search User by Gmail (Partial Search)
    app.get("/users/search", async (req, res) => {
      try {
        const email = req.query.email;
        if (!email) return res.json([]);

        const users = await usersCollection
          .find({ email: { $regex: email, $options: "i" } }) // Partial match
          .project({ name: 1, email: 1, photoURL: 1 }) // sending only needed data
          .toArray();

        res.json(users);
      } catch (error) {
        res.status(500).json({ error: "Something went wrong" });
      }
    });

    // Full Member Details + Direct Team + Total Team Count
    app.get("/users/:email", async (req, res) => {
      try {
        const email = req.params.email;

        // 1. Main user data
        const user = await usersCollection.findOne(
          { email },
          {
            projection: {
              name: 1,
              email: 1,
              photoURL: 1,
              profits: 1,
              balance: 1,
              phone: 1,
              teamMembers: 1, // Level 1 referrals
              team: 1, // Total team count (number only)
              createdAt: 1,
            },
          }
        );

        if (!user) return res.status(404).json({ error: "User not found" });

        // 2. Get full info of all direct members (teamMembers array)
        let teamDetails = [];
        if (user.teamMembers?.length > 0) {
          teamDetails = await usersCollection
            .find(
              { email: { $in: user.teamMembers } },
              { projection: { name: 1, email: 1, photoURL: 1 } }
            )
            .toArray();
        }

        res.json({
          ...user,
          teamDetails,
          totalTeam: user.team || teamDetails.length, // Fallback
        });
      } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
      }
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);
// If this file is run directly (for local development), start the HTTP server.
if (require.main === module) {
  app.listen(port, () => console.log(`Server listening on port ${port}`));
}

module.exports = app;
