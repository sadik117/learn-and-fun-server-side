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
  .map(s => s.trim())
  .filter(Boolean);

// Safe defaults for local dev + your Netlify domain
const defaultWhitelist = [
  "http://localhost:5173",
  "https://learnandearned.netlify.app",
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

const otpStore = new Map();

app.get("/", (req, res) => {
  res.send("Learn and Earn is running..");
});

// app.listen(port, () => {
//   console.log(`Example app listening on port ${port}`);
// });

// const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
//   "utf8"
// );
// const serviceAccount = JSON.parse(decoded);

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

// firebase.js
// admin.initializeApp({
//   credential: admin.credential.cert(serviceAccount),
// });

// const verifyAccessToken = async (req, res, next) => {
//   const authHeader = req.headers.authorization;

//   if (!authHeader?.startsWith("Bearer ")) {
//     return res.status(401).json({ message: "Unauthorized" });
//   }

//   const idToken = authHeader.split(" ")[1];

//   try {
//     const decodedToken = await admin.auth().verifyIdToken(idToken);
//     req.user = decodedToken;
//     next();
//   } catch (error) {
//     return res.status(403).json({ message: "Invalid or expired token" });
//   }
// };

// const verifyTokenEmail = (req, res, next) => {
//   if (req.query.email !== req.user.email) {
//     return res.status(403).json({ message: "Forbidden access" });
//   }
//   next();
// };

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
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    // Add users
    // app.post("/users", async (req, res) => {
    //   const user = req.body;
    //   if (!user.email)
    //     return res.status(400).send({ error: "Email is required" });

    //   const usersCollection = client.db("learnNfunDB").collection("users");
    //   const existingUser = await usersCollection.findOne({ email: user.email });

    //   if (existingUser) {
    //     // User already exists → just return token
    //     const token = jwt.sign({ email: user.email }, jwtSecret, {
    //       expiresIn: "20d",
    //     });
    //     return res.status(200).send({ message: "User already exists", token });
    //   }

    //   // New user → insert and return token
    //   const result = await usersCollection.insertOne(user);
    //   const token = jwt.sign({ email: user.email }, jwtSecret, {
    //     expiresIn: "20d",
    //   });
    //   res.status(201).send({ result, token });
    // });

    // for missing users referal code and link setup
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

    // signup user with reffer
    app.post("/users", async (req, res) => {
      const { email, name, phone, referredBy } = req.body;
      if (!email) return res.status(400).send({ error: "Email is required" });

      // Check if user already exists
      const existingUser = await usersCollection.findOne({ email });
      if (existingUser) {
        const token = jwt.sign({ email }, jwtSecret, { expiresIn: "20d" });
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

      const token = jwt.sign({ email }, jwtSecret, { expiresIn: "20d" });

      res.status(201).send({
        message: "User registered successfully",
        referralLink: `${process.env.CLIENT_URL}/auth/signup?ref=${referralCode}`,
        token,
      });
    });

    // Rollback route
    app.delete("/users/:email", async (req, res) => {
      const { email } = req.params;
      const usersCollection = client.db("learnNfunDB").collection("users");
      await usersCollection.deleteOne({ email });
      res.send({ message: "User rolled back successfully" });
    });

    // get user role
   // get user role (no auth required; add verifyToken if you want to restrict)
app.get("/users/:email/role", async (req, res) => {
  try {
    // emails can contain '+', '%', etc. — decode safely
    const raw = req.params.email || "";
    const email = decodeURIComponent(raw);

    if (!email) {
      return res.status(400).json({ error: "Email param required" });
    }

    // Use the existing collection defined above
    const user = await usersCollection.findOne(
      { email },
      { projection: { role: 1, _id: 0 } }
    );

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // default to "user" if role missing
    res.json({ role: user.role || "user" });
  } catch (err) {
    console.error("GET /users/:email/role error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});



    // get user profile
    app.get("/my-profile", verifyToken, async (req, res) => {
      const email = req.user.email;
      const user = await usersCollection.findOne({ email });

      if (!user) return res.status(404).send({ error: "User not found" });

      // Ensure referralCode exists
      if (!user.referralCode) {
        const referralCode = generateReferralCode();
        await usersCollection.updateOne({ email }, { $set: { referralCode } });
        user.referralCode = referralCode;
      }

      // Populate referrer details if referredBy exists
      let referrer = null;
      if (user.referredBy) {
        referrer = await usersCollection.findOne(
          { referralCode: user.referredBy },
          { projection: { name: 1, email: 1, _id: 0 } }
        );
      }

      // Remove sensitive info
      delete user.password;
      delete user._id;

      res.send({
        ...user,
        referrer, // send referrer info
      });
    });

    // get team data
    app.get("/my-team", verifyToken, async (req, res) => {
      try {
        const email = req.user.email;
        const usersCollection = client.db("learnNfunDB").collection("users");

        const user = await usersCollection.findOne({ email });
        if (!user) return res.status(404).send({ error: "User not found" });

        const teamMembers = Array.isArray(user.teamMembers)
          ? user.teamMembers
          : [];

        if (teamMembers.length === 0) {
          return res.send({ team: [] });
        }

        // Now teamMembers are ObjectIds
        const team = await usersCollection
          .find({ _id: { $in: teamMembers } })
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

    // PATCH to set role to "member" and initialize lottery fields + reward referrer
    app.patch(
      "/pending-users/:email/approve",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const { email } = req.params;

        try {
          // Find the user first
          const user = await usersCollection.findOne({ email });
          if (!user) {
            return res
              .status(404)
              .send({ success: false, message: "User not found" });
          }

          // Update this user's role & initial balance
          const result = await usersCollection.updateOne(
            { email },
            {
              $set: {
                role: "member",
                freePlaysLeft: 3,
                playsCount: 0,
                balance: 800, // starting balance
                profits: 0,
              },
            }
          );

          // If the user was referred by someone, reward that referrer
          if (user.referredBy) {
            await usersCollection.updateOne(
              { referralCode: user.referredBy }, // find referrer by referralCode
              {
                $inc: { balance: 500, profits: 500, freePlaysLeft: 3 },
              }
            );
          }

          if (result.modifiedCount > 0) {
            res.send({
              success: true,
              message: "User promoted to member",
            });
          } else {
            res
              .status(400)
              .send({ success: false, message: "Failed to update role" });
          }
        } catch (error) {
          console.error(error);
          res.status(500).send({ success: false, message: "Server error" });
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

    // POST /lottery/play
    app.post("/lottery/play", verifyToken, async (req, res) => {
      try {
        const email = req.user.email;
        const user = await usersCollection.findOne({ email });

        if (!user) {
          return res
            .status(404)
            .send({ success: false, message: "User not found" });
        }

        let freePlaysLeft = user.freePlaysLeft ?? 0;
        let playsCount = user.playsCount ?? 0;
        let balance = user.balance ?? 0;
        let profits = user.profits ?? 0;

        // Not enough balance (and no free plays)
        if (freePlaysLeft <= 0 && balance < 50) {
          return res.status(400).send({
            success: false,
            message: "Not enough free plays or balance to play.",
          });
        }

        // Track whether this spin consumed a free play or a paid play
        const usedFreePlay = freePlaysLeft > 0;

        // Deduct cost or free play
        if (usedFreePlay) {
          freePlaysLeft -= 1;
        } else {
          balance -= 50; // paid spin costs 50 upfront
        }

        playsCount += 1;

        // Generate initial slots (will be overridden to diamonds on win)
        const slotItems = ["🍒", "🍋", "🍇", "🍊", "7️⃣", "⭐", "💎"];
        const slots = [
          slotItems[Math.floor(Math.random() * slotItems.length)],
          slotItems[Math.floor(Math.random() * slotItems.length)],
          slotItems[Math.floor(Math.random() * slotItems.length)],
        ];

        // Winning logic: 40% chance OR all 3 same symbols
        let win = false;
        if (
          Math.random() < 0.4 ||
          (slots[0] === slots[1] && slots[1] === slots[2])
        ) {
          win = true;

          // Always show 💎💎💎 on win
          slots[0] = "💎";
          slots[1] = "💎";
          slots[2] = "💎";

          // Prize is 50 taka. If this was a paid spin,
          // also refund the stake (50) so the net gain is +50.
          if (usedFreePlay) {
            balance += 50; // free play: +50 net
          } else {
            balance += 100; // paid play: refund 50 + prize 50 -> net +50
          }

          // Track “profits” as the prize only (50)
          profits += 50;
        }

        // Save user
        await usersCollection.updateOne(
          { email },
          { $set: { freePlaysLeft, playsCount, balance, profits } }
        );

        // Friendly message
        const message = win
          ? usedFreePlay
            ? "Congrats! You won 50৳ 🎉" // (free play)
            : "Congrats! You won 50৳ 🎉" // (stake refunded + 50৳ prize)
          : "Better luck next time!";

        return res.send({
          success: true,
          message,
          win,
          slots, // 💎💎💎 on wins
          freePlaysLeft,
          playsCount,
          balance,
          profits,
        });
      } catch (err) {
        console.error(err);
        res.status(500).send({ success: false, message: "Server error" });
      }
    });

    // Withdraw request API (member side)
    app.post("/withdraw", verifyToken, async (req, res) => {
      try {
        const email = req.user?.email;
        const { amount } = req.body;

        if (!email) return res.status(401).json({ message: "Unauthorized" });
        if (amount <= 0)
          return res.status(400).json({ message: "Invalid amount" });

        const user = await usersCollection.findOne({ email });
        if (!user) return res.status(404).json({ message: "User not found" });

        if (user.balance < amount) {
          return res.status(400).json({ message: "Insufficient balance" });
        }

        // Store request in withdrawals collection
        const withdrawalRequest = {
          userId: user._id,
          email: user.email,
          name: user.name,
          amount,
          status: "pending", // pending | approved | rejected
          createdAt: new Date(),
        };

        await withdrawalsCollection.insertOne(withdrawalRequest);

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
    app.get("/courses", async (req, res) => {
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
    app.get("/videos", async (req, res) => {
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

    /**
     * ADMIN – delete video
     */
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
module.exports = app;
