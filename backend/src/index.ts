import express from 'express';
import cors from 'cors';
import { initDatabase } from './db/database';
import { seedDatabase } from './seed';
import apiRoutes from './routes/api';

const app = express();
const PORT = process.env.PORT || 3001;

initDatabase();
seedDatabase();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/api', apiRoutes);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Kilimo Bridge API running on http://localhost:${PORT}`);
});
