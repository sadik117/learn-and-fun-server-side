const express = require('express');
const router = express.Router();
const { getDb } = require('../utils/db');
const { verifyToken } = require('../utils/jwt');

// Get current user profile
router.get('/me', verifyToken, async (req, res) => {
  try {
    const db = await getDb();
    const user = await db.collection('users').findOne({ email: req.user.email });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update user profile
router.put('/me', verifyToken, async (req, res) => {
  try {
    const db = await getDb();
    const updates = req.body;
    await db.collection('users').updateOne(
      { email: req.user.email },
      { $set: updates }
    );
    const updatedUser = await db.collection('users').findOne({ email: req.user.email });
    res.json(updatedUser);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get team members (for referral system)
router.get('/team', verifyToken, async (req, res) => {
  try {
    const db = await getDb();
    const user = await db.collection('users').findOne({ email: req.user.email });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const members = await db.collection('users').find({ _id: { $in: user.teamMembers || [] } }).toArray();
    res.json(members);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
