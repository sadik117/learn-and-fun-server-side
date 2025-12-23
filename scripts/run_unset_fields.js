require('dotenv').config();
const { MongoClient } = require('mongodb');

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.hlucnuf.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: '1',
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    console.log('MongoDB connected — running unset migration');

    const usersCollection = client.db('learnNfunDB').collection('users');

    const result = await usersCollection.updateMany(
      {},
      {
        $unset: {
          freePlaysLeft: '',
          playsCount: '',
          lastPlayDate: '',
          locked: '',
          slots: '',
        },
      }
    );

    console.log(`Migration complete — matched: ${result.matchedCount}, modified: ${result.modifiedCount}`);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  } finally {
    await client.close();
    process.exit();
  }
}

run();
