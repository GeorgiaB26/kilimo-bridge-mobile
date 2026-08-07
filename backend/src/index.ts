import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { initDatabase } from './db/database';
import { seedDatabase } from './seed';
import { seedHierarchyIfEmpty, getProgramProjectCount, getDemoFarmerTaskCount } from './seedHierarchy';
import { ensureDemoFarmerPortal, ensureDemoAgentPassword } from './ensureDemoFarmerPortal';
import { seedAggregationCentres } from './services/aggregationCentreService';
import { ensureFarmerHelpRequestsTable } from './services/farmerHelpRequestService';
import { ensureAgentTasksTable } from './services/agentDashboardService';
import { ensureMessagingTables } from './services/messagingService';
import { ensureFarmerTaskAssignerColumn } from './services/hierarchyService';
import messagesRoutes from './routes/messages';
import notificationsRoutes from './routes/notifications';
import { backfillLegacyIdNumberHashes } from './services/farmerService';
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
import aggregationCentresRoutes from './routes/aggregationCentres';
import uploadsRoutes from './routes/uploads';
import { getR2ConfigStatus } from './services/r2StorageService';
import { apiRateLimiter } from './middleware/security';
import { getAdminStats } from './services/userService';
import { getFarmerCount } from './db/database';

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '0.0.0.0';

let appReady = false;
let bootstrapError: string | null = null;
let cachedFarmerCount: number | null = null;
let cachedHierarchyProjects: number | null = null;
let cachedDemoFarmerTasks: number | null = null;

// Render / Netlify proxies — required so rate limits apply per client IP, not one shared IP
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

function healthPayload() {
  return {
    status: bootstrapError ? 'error' : appReady ? 'ok' : 'starting',
    error: bootstrapError,
    timestamp: new Date().toISOString(),
    api_build: 'v2.11.18-task-categorization-fix',
    field_agent_features: {
      messaging_restricted: true,
      notification_settings_legacy_sync: true,
    },
    farmers: appReady ? cachedFarmerCount : null,
    hierarchy_projects: appReady ? cachedHierarchyProjects : null,
    demo_farmer_tasks: appReady ? cachedDemoFarmerTasks : null,
    photo_storage: getR2ConfigStatus(),
    // Env vars are only re-read on restart — use this to confirm a Render env change took effect
    started_at: new Date(Date.now() - Math.round(process.uptime() * 1000)).toISOString(),
    uptime_seconds: Math.round(process.uptime()),
  };
}

async function refreshHealthCounts(): Promise<number> {
  const farmerCount = await getFarmerCount();
  cachedFarmerCount = farmerCount;
  cachedHierarchyProjects = await getProgramProjectCount();
  cachedDemoFarmerTasks = await getDemoFarmerTaskCount();
  return farmerCount;
}

// Health probe — must respond 200 before heavy bootstrap (Render deploy check)
app.get('/health', (_req, res) => {
  res.status(200).json(healthPayload());
});

app.listen(PORT, HOST, () => {
  console.log(`Kilimo Bridge API listening on ${HOST}:${PORT}`);
  bootstrap().catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    bootstrapError = message;
    console.error('Bootstrap failed (service stays up for /health diagnostics):', err);
  });
});

async function runSchemaEnsures(): Promise<void> {
  await ensureFarmerHelpRequestsTable();
  await ensureAgentTasksTable();
  await ensureMessagingTables();
  await ensureFarmerTaskAssignerColumn();
}

async function runSeedAndCounts(): Promise<number> {
  const farmerCount = await refreshHealthCounts();
  console.log(`Database ready: ${farmerCount} farmers`);

  const backfilled = await backfillLegacyIdNumberHashes();
  if (backfilled > 0) {
    console.log(`Backfilled id_number_hash for ${backfilled} legacy farmer(s)`);
  }

  await seedAggregationCentres();
  if (farmerCount <= 10) {
    await seedDatabase();
  }
  await ensureDemoFarmerPortal();
  await ensureDemoAgentPassword();
  await seedHierarchyIfEmpty();
  await refreshHealthCounts();
  return farmerCount;
}

function mountApiRoutes(): void {
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
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
  app.use('/api/aggregation-centres', aggregationCentresRoutes);
  app.use('/api/banking', bankingRoutes);
  app.use('/api/agents', agentRoutes);
  app.use('/api/messages', messagesRoutes);
  app.use('/api/notifications', notificationsRoutes);
  app.use('/api/audit', auditRoutes);
  app.use('/api/webhooks', equityWebhookRouter);
  app.use('/api/uploads', uploadsRoutes);
  app.use('/api', apiRoutes);

  app.get('/api/metrics/live', async (req, res) => {
    const trackerKey = process.env.TRACKER_API_KEY;
    const provided = req.headers['x-tracker-key'] as string | undefined;
    if (trackerKey && provided !== trackerKey) {
      res.status(401).json({ error: 'Invalid tracker API key' });
      return;
    }
    const stats = await getAdminStats();
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

async function bootstrap(): Promise<void> {
  validateProductionEnv();
  initDatabase();

  try {
    await runSchemaEnsures();
  } catch (err) {
    console.error('[bootstrap] Schema ensure step failed (continuing):', err);
  }

  try {
    await runSeedAndCounts();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    bootstrapError = message;
    console.error('[bootstrap] Database seed/count step failed:', err);
  }

  mountApiRoutes();
}
