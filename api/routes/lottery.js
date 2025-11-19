import express from 'express';
import { getDb } from '../utils/db.js';

const router = express.Router();

router.get('/results', async (req, res) => {
  const db = await getDb();
  const results = await db.collection('lottery').find({}).toArray();
  res.json(results);
});

router.post('/draw', async (req, res) => {
  const db = await getDb();
  const { winnerEmail, amount } = req.body;
  const result = await db.collection('lottery').insertOne({ winnerEmail, amount, date: new Date() });
  res.json(result);
});

export default router;
