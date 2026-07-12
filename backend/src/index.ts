import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { initDatabase } from './db/database';
import { seedDatabase } from './seed';
import apiRoutes from './routes/api';
import authRoutes from './routes/auth';
import farmerRoutes from './routes/farmer';
import adminDashboardRoutes from './routes/adminDashboard';
import bankingRoutes, { equityWebhookRouter } from './routes/banking';
import agentRoutes from './routes/agents';
import auditRoutes from './routes/audit';
import { apiRateLimiter } from './middleware/security';

const app = express();
const PORT = process.env.PORT || 3001;

initDatabase();
seedDatabase();

// Security headers (HSTS enabled in production via helmet)
app.use(helmet({
  hsts: process.env.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true } : false,
}));
const corsOrigins = process.env.CORS_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean);
app.use(cors(corsOrigins?.length ? { origin: corsOrigins, credentials: true } : undefined));
app.use(express.json({ limit: '10mb' }));
app.use(apiRateLimiter);

// Force HTTPS redirect in production
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
  });
}

app.use('/api/auth', authRoutes);
app.use('/api/farmer', farmerRoutes);
app.use('/api/admin', adminDashboardRoutes);
app.use('/api/banking', bankingRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/webhooks', equityWebhookRouter);
app.use('/api', apiRoutes);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Kilimo Bridge API running on http://localhost:${PORT}`);
});
