import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { initDatabase } from './db/database';
import { seedDatabase } from './seed';
import { seedHierarchyIfEmpty } from './seedHierarchy';
import { ensureDemoFarmerPortal, ensureDemoAgentPassword } from './ensureDemoFarmerPortal';
import { maybeRestoreDatabaseOnStartup } from './startupRestore';
import { validateProductionEnv } from './validateEnv';
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
import { getFarmerCount, db } from './db/database';

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '0.0.0.0';

let appReady = false;

// Render / Netlify proxies — required so rate limits apply per client IP, not one shared IP
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

function healthPayload() {
  let hierarchyProjects = 0;
  let demoFarmerTasks = 0;
  try {
    hierarchyProjects = (db.prepare('SELECT COUNT(*) as c FROM program_projects').get() as { c: number }).c;
    const demoFarmer = db.prepare('SELECT farmer_id FROM farmers WHERE phone_number = ?').get('+254712345678') as
      | { farmer_id: string }
      | undefined;
    if (demoFarmer) {
      demoFarmerTasks = (db.prepare('SELECT COUNT(*) as c FROM farmer_tasks WHERE farmer_id = ?').get(demoFarmer.farmer_id) as { c: number }).c;
    }
  } catch {
    // optional until DB init completes
  }
  return {
    status: appReady ? 'ok' : 'starting',
    timestamp: new Date().toISOString(),
    farmers: appReady ? getFarmerCount() : null,
    hierarchy_projects: hierarchyProjects,
    demo_farmer_tasks: demoFarmerTasks,
  };
}

// Health probe — must respond 200 before heavy bootstrap (Render deploy check)
app.get('/health', (_req, res) => {
  res.status(200).json(healthPayload());
});

app.listen(PORT, HOST, () => {
  console.log(`Kilimo Bridge API listening on ${HOST}:${PORT}`);
  bootstrap().catch((err) => {
    console.error('Failed to start:', err);
    process.exit(1);
  });
});

async function bootstrap(): Promise<void> {
  validateProductionEnv();
  initDatabase();
  await maybeRestoreDatabaseOnStartup();
  seedDatabase();
  ensureDemoFarmerPortal();
  await ensureDemoAgentPassword();
  seedHierarchyIfEmpty();

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
      if (req.path === '/health') return next();
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

  appReady = true;
  console.log('Kilimo Bridge API ready');
}
