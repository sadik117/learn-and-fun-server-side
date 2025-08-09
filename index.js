const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 3000;
// const admin = require("firebase-admin");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

app.use(
  cors({
    origin: `${process.env.CLIENT_URL}`,
    credentials: true,
  })
);
app.use(express.json());

const otpStore = new Map();

app.get("/", (req, res) => {
  res.send("Learn and Fun is running..");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});

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
    subject: "Your OTP Code",
    text: `Your OTP for registration is: ${otp}. It will expire in 5 minutes.`,
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
  const token = jwt.sign(user, jwtSecret, { expiresIn: "20d" });
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
    // await client.connect();

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
      const { email, name, referredBy } = req.body;
      if (!email) return res.status(400).send({ error: "Email is required" });

      const usersCollection = client.db("learnNfunDB").collection("users");
      const existingUser = await usersCollection.findOne({ email });

      if (existingUser) {
        const token = jwt.sign({ email }, jwtSecret, { expiresIn: "20d" });
        return res.status(200).send({ message: "User already exists", token });
      }

      const referralCode = generateReferralCode();

      const newUser = {
        name,
        email,
        referralCode,
        referredBy: referredBy || null,
        teamMembers: [],
        createdAt: new Date(),
      };

      // Insert user
      await usersCollection.insertOne(newUser);

      // If referred by someone, update that person's teamMembers
      if (referredBy) {
        await usersCollection.updateOne(
          { referralCode: referredBy },
          { $push: { teamMembers: referralCode } }
        );
      }

      const token = jwt.sign({ email }, jwtSecret, { expiresIn: "20d" });
      res.status(201).send({
        message: "User registered successfully",
        referralLink: `${process.env.CLIENT_URL}/auth/signup?ref=${referralCode}`,
        token,
      });
    });

    // get user role

    app.get("/users/:email/role", async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne(
        { email },
        { projection: { role: 1 } }
      );
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json({ role: user.role || "user" });
    });
    

    // get user profile
    app.get("/my-profile", verifyToken, async (req, res) => {
      const email = req.user.email;
      const user = await usersCollection.findOne({ email });

      if (!user) {
        return res.status(404).send({ error: "User not found" });
      }

      if (!user.referralCode) {
        const referralCode = generateReferralCode();
        await usersCollection.updateOne({ email }, { $set: { referralCode } });
        user.referralCode = referralCode;
      }

      // Remove sensitive fields before sending if needed
      delete user.password;
      delete user._id;

      res.send(user);
    });

    // get team data

    app.get("/my-team", verifyToken, async (req, res) => {
      try {
        const email = req.user.email;
        const usersCollection = client.db("learnNfunDB").collection("users");

        const user = await usersCollection.findOne({ email });
        if (!user) return res.status(404).send({ error: "User not found" });

        // Defensive check: teamMembers must be an array
        const teamMembers = Array.isArray(user.teamMembers)
          ? user.teamMembers
          : [];

        if (teamMembers.length === 0) {
          // No team members → send empty array
          return res.send({ team: [] });
        }

        const team = await usersCollection
          .find({ referralCode: { $in: teamMembers } })
          .project({ name: 1, email: 1, _id: 0 })
          .toArray();

        res.send({ team });
      } catch (error) {
        console.error("Error in /my-team:", error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);
