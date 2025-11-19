import express from 'express';
import { randomBytes } from 'crypto';
import { generateToken } from '../utils/jwt.js';
import { getDb } from '../utils/db.js';

const router = express.Router();

// Create or login user
router.post('/', async (req, res) => {
  try {
    const db = await getDb();
    const usersColl = db.collection('users');
    const { email: inputEmail, name, phone, photoURL, referredBy } = req.body;
    if (!inputEmail) return res.status(400).send({ error: 'Email is required' });

    const email = inputEmail.trim().toLowerCase();
    let user = await usersColl.findOne({ email });
    if (user) {
      const token = generateToken({ email });
      return res.status(200).send({ message: 'User exists', token });
    }

    const referralCode = randomBytes(4).toString('hex').toUpperCase();
    const newUser = { name, email, phone, photoURL, referralCode, referredBy: referredBy || null, role: 'user', teamMembers: [], createdAt: new Date() };
    const result = await usersColl.insertOne(newUser);

    if (referredBy) await usersColl.updateOne({ referralCode: referredBy }, { $push: { teamMembers: result.insertedId } });

    const token = generateToken({ email });
    res.status(201).send({ message: 'User registered', referralLink: `${process.env.CLIENT_URL}/auth/signup?ref=${referralCode}`, token });
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: 'Server error' });
  }
});

// Get all users (protected route example)
router.get('/', async (req, res) => {
  const db = await getDb();
  const users = await db.collection('users').find({}).toArray();
  res.json(users);
});

export default router;
