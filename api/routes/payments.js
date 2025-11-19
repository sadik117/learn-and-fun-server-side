const express = require('express');
const router = express.Router();
const { getDb } = require('../utils/db');
const { verifyToken } = require('../utils/jwt');
const { ObjectId } = require('mongodb');

// Get user transactions
router.get('/transactions', verifyToken, async (req, res) => {
  try {
    const db = await getDb();
    const transactions = await db.collection('transactions').find({ email: req.user.email }).sort({ createdAt: -1 }).toArray();
    res.json(transactions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Deposit (add funds)
router.post('/deposit', verifyToken, async (req, res) => {
  try {
    const { amount, method } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

    const db = await getDb();
    const transaction = {
      email: req.user.email,
      type: 'deposit',
      amount,
      method: method || 'USDT',
      createdAt: new Date(),
    };
    await db.collection('transactions').insertOne(transaction);
    await db.collection('users').updateOne({ email: req.user.email }, { $inc: { balance: amount } });

    res.json({ success: true, transaction });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Withdraw funds
router.post('/withdraw', verifyToken, async (req, res) => {
  try {
    const { amount, method } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

    const db = await getDb();
    const user = await db.collection('users').findOne({ email: req.user.email });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if ((user.balance || 0) < amount) return res.status(400).json({ error: 'Insufficient balance' });

    const transaction = {
      email: req.user.email,
      type: 'withdraw',
      amount,
      method: method || 'USDT',
      createdAt: new Date(),
    };
    await db.collection('transactions').insertOne(transaction);
    await db.collection('users').updateOne({ email: req.user.email }, { $inc: { balance: -amount } });

    res.json({ success: true, transaction });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
