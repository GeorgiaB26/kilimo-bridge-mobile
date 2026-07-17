import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { initDatabase } from './db/database';
import { seedDatabase } from './seed';
import { maybeRestoreDatabaseOnStartup } from './startupRestore';
import apiRoutes from './routes/api';
import authRoutes from './routes/auth';
import farmerRoutes from './routes/farmer';
import adminDashboardRoutes from './routes/adminDashboard';
import bankingRoutes, { equityWebhookRouter } from './routes/banking';
import agentRoutes from './routes/agents';
import auditRoutes from './routes/audit';
import hierarchyAdminRoutes from './routes/hierarchyAdmin';
import aggregationRoutes from './routes/aggregation';
import { apiRateLimiter } from './middleware/security';
import { getAdminStats } from './services/userService';
import { getFarmerCount } from './db/database';

const app = express();
const PORT = process.env.PORT || 3001;

async function bootstrap(): Promise<void> {
  initDatabase();
  await maybeRestoreDatabaseOnStartup();
  seedDatabase();

  app.use(helmet({
    hsts: process.env.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true } : false,
  }));
  const corsOrigins = process.env.CORS_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean);
  app.use(
    cors(
      corsOrigins?.length
        ? { origin: corsOrigins, credentials: true }
        : { origin: true, credentials: true }
    )
  );
  app.use(express.json({ limit: '10mb' }));
  app.use(apiRateLimiter);

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
  app.use('/api/admin', hierarchyAdminRoutes);
  app.use('/api/aggregation', aggregationRoutes);
  app.use('/api/banking', bankingRoutes);
  app.use('/api/agents', agentRoutes);
  app.use('/api/audit', auditRoutes);
  app.use('/api/webhooks', equityWebhookRouter);
  app.use('/api', apiRoutes);

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      farmers: getFarmerCount(),
    });
  });

  app.get('/api/metrics/live', (req, res) => {
    const trackerKey = process.env.TRACKER_API_KEY;
    const provided = req.headers['x-tracker-key'] as string | undefined;
    if (trackerKey && provided !== trackerKey) {
      res.status(401).json({ error: 'Invalid tracker API key' });
      return;
    }
    const stats = getAdminStats();
    res.json({
      updatedAt: new Date().toISOString(),
      totalFarmers: stats.totalFarmers,
      totalUsers: stats.totalUsers,
      activeAgents: stats.activeAgents,
      activeProjects: stats.activeProjects,
      pendingPaymentsTotal: stats.pendingPaymentsTotal,
      pendingBankTransactions: stats.pendingBankTransactions,
      farmersByCountry: stats.farmersByCountry,
      centresByCountry: stats.centresByCountry,
      recentImports: stats.recentImports,
    });
  });

  app.listen(PORT, () => {
    console.log(`Kilimo Bridge API running on http://localhost:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
