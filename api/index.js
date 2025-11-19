const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const paymentsRoutes = require('./routes/payments');
const coursesRoutes = require('./routes/courses');
const lotteryRoutes = require('./routes/lottery');

const app = express();
app.use(express.json());

// CORS setup
const defaultWhitelist = [
  'http://localhost:5173',
  'https://learnandearned.netlify.app',
  'https://learnandearned.vercel.app',
  'https://www.learnandearned.xyz',
  'https://learnandearned.xyz',
  'https://www.learnandearned.com',
  'https://learnandearned.com',
];

const envOrigins = (process.env.CLIENT_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const whitelist = new Set([...defaultWhitelist, ...envOrigins]);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (whitelist.has(origin)) return cb(null, true);
      return cb(new Error(`Not allowed by CORS: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Mount routes
app.use('/auth', authRoutes);
app.use('/users', usersRoutes);
app.use('/payments', paymentsRoutes);
app.use('/courses', coursesRoutes);
app.use('/lottery', lotteryRoutes);

// Root
app.get('/', (req, res) => res.send('Learn & Earn API is running'));

// Export for Vercel
module.exports = app;
