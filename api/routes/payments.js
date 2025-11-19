import express from 'express';
import { getDb } from '../utils/db.js';

const router = express.Router();

// Deposit, Withdraw, Swap, etc.
router.post('/deposit', async (req, res) => {
  const db = await getDb();
  const depositsColl = db.collection('deposits');
  const { userEmail, amount, currency } = req.body;
  const result = await depositsColl.insertOne({ userEmail, amount, currency, createdAt: new Date() });
  res.json({ success: true, result });
});

router.post('/withdraw', async (req, res) => {
  const db = await getDb();
  const withdrawalsColl = db.collection('withdrawals');
  const { userEmail, amount, currency } = req.body;
  const result = await withdrawalsColl.insertOne({ userEmail, amount, currency, createdAt: new Date() });
  res.json({ success: true, result });
});

export default router;
