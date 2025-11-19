import express from 'express';
import { createTransport } from 'nodemailer';
import { storeOtp, verifyOtp } from '../utils/otp.js';

const router = express.Router();

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
      text: `Your OTP is: ${otp}. It will expire in 10 minutes.`,
    });
    await storeOtp(email, otp);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to send OTP' });
  }
});

// Verify OTP
router.post('/verify-otp', async (req, res) => {
  const { email, otp } = req.body;
  const result = await verifyOtp(email, otp);
  if (!result.valid) return res.status(400).json({ success: false, message: result.message });
  res.json({ success: true, message: 'OTP verified' });
});

export default router;
