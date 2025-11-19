const express = require('express');
const router = express.Router();
const { createTransport } = require('nodemailer');
const { randomBytes } = require('crypto');
const { generateToken } = require('../utils/jwt');
const { storeOtp, verifyOtpDb } = require('../utils/otp');
const { getDb } = require('../utils/db');

// Send OTP
router.post('/send-otp', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, message: 'Email required' });

  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  const transporter = createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'OTP Code',
      text: `Your OTP is: ${otp}. It expires in 10 minutes.`,
    });

    await storeOtp(email, otp);
    res.json({ success: true, otp }); // Remove otp in production
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to send OTP' });
  }
});

// Verify OTP
router.post('/verify-otp', async (req, res) => {
  const { email, otp } = req.body;
  const result = await verifyOtpDb(email, otp);
  if (!result.valid) return res.status(400).json({ success: false, message: result.message });
  res.json({ success: true, message: 'OTP verified' });
});

// User registration
router.post('/signup', async (req, res) => {
  try {
    const db = await getDb();
    const usersColl = db.collection('users');
    const { email: inputEmail, name, phone, photoURL, referredBy } = req.body;
    if (!inputEmail) return res.status(400).json({ error: 'Email required' });

    const email = inputEmail.trim().toLowerCase();
    let user = await usersColl.findOne({ email });

    if (user) {
      const token = generateToken({ email });
      return res.status(200).json({ message: 'User exists', token });
    }

    const referralCode = randomBytes(4).toString('hex').toUpperCase();
    const newUser = {
      name,
      email,
      phone,
      photoURL,
      referralCode,
      referredBy: referredBy || null,
      role: 'user',
      teamMembers: [],
      createdAt: new Date(),
    };

    const result = await usersColl.insertOne(newUser);
    if (referredBy) {
      await usersColl.updateOne(
        { referralCode: referredBy },
        { $push: { teamMembers: result.insertedId } }
      );
    }

    const token = generateToken({ email });
    res.status(201).json({ message: 'User registered', referralLink: `${process.env.CLIENT_URL}/auth/signup?ref=${referralCode}`, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
