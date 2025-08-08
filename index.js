const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 3000;
const admin = require("firebase-admin");
import nodemailer from "nodemailer";
import crypto from "crypto";

app.use(cors());
app.use(express.json());

let otpStore = {};

app.get("/", (req, res) => {
  res.send("Learn and Fun is running..");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});

const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf8"
);
const serviceAccount = JSON.parse(decoded);

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.hlucnuf.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// firebase.js
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const verifyAccessToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const idToken = authHeader.split(" ")[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken;
    next();
  } catch (error) {
    return res.status(403).json({ message: "Invalid or expired token" });
  }
};

const verifyTokenEmail = (req, res, next) => {
  if (req.query.email !== req.user.email) {
    return res.status(403).json({ message: "Forbidden access" });
  }
  next();
};

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    app.post("/send-otp", async (req, res) => {
      const { email } = req.body;
      if (!email)
        return res
          .status(400)
          .json({ success: false, message: "Email required" });

      const otp = crypto.randomInt(100000, 999999).toString();
      otpStore[email] = { otp, expires: Date.now() + 5 * 60 * 1000 };

      const transporter = nodemailer.createTransport({
        service: "Gmail",
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
      });

      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject: "Your OTP Code",
        text: `Your verification code is ${otp}. It expires in 5 minutes.`,
      });

      res.json({ success: true, message: "OTP sent to email" });
    });

    app.post("/verify-otp", (req, res) => {
      const { email, otp } = req.body;
      const record = otpStore[email];

      if (!record)
        return res.status(400).json({ success: false, message: "No OTP sent" });
      if (record.expires < Date.now())
        return res.status(400).json({ success: false, message: "OTP expired" });
      if (record.otp !== otp)
        return res.status(400).json({ success: false, message: "Invalid OTP" });

      delete otpStore[email];
      res.json({ success: true });
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    // console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);
