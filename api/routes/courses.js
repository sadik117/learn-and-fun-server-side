const express = require('express');
const router = express.Router();
const { getDb } = require('../utils/db');
const { verifyToken } = require('../utils/jwt');
const { ObjectId } = require('mongodb');

// Get all courses
router.get('/', async (req, res) => {
  try {
    const db = await getDb();
    const courses = await db.collection('courses').find({}).toArray();
    res.json(courses);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add course (admin)
router.post('/', verifyToken, async (req, res) => {
  try {
    const db = await getDb();
    const user = await db.collection('users').findOne({ email: req.user.email });
    if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });

    const course = req.body;
    course.createdAt = new Date();
    const result = await db.collection('courses').insertOne(course);
    res.json({ success: true, courseId: result.insertedId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get specific course
router.get('/:id', async (req, res) => {
  try {
    const db = await getDb();
    const course = await db.collection('courses').findOne({ _id: new ObjectId(req.params.id) });
    if (!course) return res.status(404).json({ error: 'Course not found' });
    res.json(course);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
