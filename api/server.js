import express from 'express';
import cors from 'cors';
import serverless from 'serverless-http';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import paymentRoutes from './routes/payments.js';
import courseRoutes from './routes/courses.js';
import lotteryRoutes from './routes/lottery.js';

const app = express();

const whitelist = [
  'http://localhost:5173',
  'https://learnandearned.vercel.app',
  'https://www.learnandearned.xyz',
  'https://learnandearned.xyz',
  'https://www.learnandearned.com',
  'https://learnandearned.com',
];

app.use(cors({ origin: (origin, cb) => (!origin || whitelist.includes(origin) ? cb(null, true) : cb(new Error('CORS'))), credentials: true }));
app.use(express.json());

app.get('/', (req, res) => res.send('Learn and Earn server is running!'));

app.use('/auth', authRoutes);
app.use('/users', userRoutes);
app.use('/payments', paymentRoutes);
app.use('/courses', courseRoutes);
app.use('/lottery', lotteryRoutes);

export default serverless(app);
