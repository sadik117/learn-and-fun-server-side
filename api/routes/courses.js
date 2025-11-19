import express from 'express';
import { getDb } from '../utils/db.js';

const router = express.Router();

router.get('/', async (req, res) => {
  const db = await getDb();
  const courses = await db.collection('courses').find({}).toArray();
  res.json(courses);
});

router.post('/', async (req, res) => {
  const db = await getDb();
  const { title, description, videoUrls } = req.body;
  const result = await db.collection('courses').insertOne({ title, description, videoUrls, createdAt: new Date() });
  res.json(result);
});

export default router;
