const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const paymentsRoutes = require('./routes/payments');
const coursesRoutes = require('./routes/courses');
const coursesRoutes = require('./routes/lottery');


const app = express();
app.use(express.json());
app.use(cors());

// Mount routes
app.use('/auth', authRoutes);
app.use('/users', usersRoutes);
app.use('/payments', paymentsRoutes);
app.use('/courses', coursesRoutes);
app.use('/lottery', lotteryRoutes);

// Root route
app.get('/', (req, res) => res.send('Learn & Earn API is running'));

// Export for Vercel serverless
module.exports = app;
