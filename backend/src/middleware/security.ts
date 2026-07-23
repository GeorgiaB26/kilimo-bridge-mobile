import { Request, Response, NextFunction } from 'express';
import rateLimit, { type Options } from 'express-rate-limit';
import { logAudit } from '../services/auditService';

const isPilot = process.env.PILOT_OTP === 'true';
const isProd = process.env.NODE_ENV === 'production';

function clientKey(req: Request): string {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

/** Render sits behind a proxy — avoid hard crashes on odd proxy IP headers */
const proxySafeRateLimit: Partial<Options> = {
  validate: {
    ip: false,
    trustProxy: false,
    xForwardedForHeader: false,
    forwardedHeader: false,
  },
  keyGenerator: (req) => clientKey(req),
};

function authLimitMax(normal: number, pilot: number): number {
  if (!isProd) return 200;
  return isPilot ? pilot : normal;
}

function createAuthLimiter(opts: { normal: number; pilot: number }) {
  return rateLimit({
    ...proxySafeRateLimit,
    windowMs: 15 * 60 * 1000,
    max: authLimitMax(opts.normal, opts.pilot),
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { error: 'Too many login attempts. Try again in 15 minutes.' },
    handler: (req, res) => {
      logAudit({
        action: 'permission.denied',
        category: 'system',
        details: { reason: 'auth_rate_limit_exceeded', path: req.path },
        ipAddress: req.ip,
        success: false,
      });
      res.status(429).json({
        error: 'Too many login attempts. Please wait 15 minutes and try again.',
        hint: isPilot
          ? 'Use the Quick access buttons on the login screen (Farmer, Admin, Agent).'
          : undefined,
      });
    },
  });
}

/** General API rate limit — 100 requests per minute per IP */
export const apiRateLimiter = rateLimit({
  ...proxySafeRateLimit,
  windowMs: 60 * 1000,
  max: isPilot && isProd ? 300 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
  handler: (req, res) => {
    logAudit({
      action: 'permission.denied',
      category: 'system',
      details: { reason: 'rate_limit_exceeded', path: req.path },
      ipAddress: req.ip,
      success: false,
    });
    res.status(429).json({ error: 'Too many requests. Please try again later.' });
  },
});

/** OTP send — separate bucket so verify attempts do not block resend */
export const otpRequestLimiter = createAuthLimiter({ normal: 25, pilot: 100 });

/** OTP verify — allow several wrong digits during demo */
export const otpVerifyLimiter = createAuthLimiter({ normal: 40, pilot: 150 });

/** Password / quick demo login */
export const loginLimiter = createAuthLimiter({ normal: 40, pilot: 150 });

/** @deprecated Use otpRequestLimiter, otpVerifyLimiter, or loginLimiter */
export const authRateLimiter = loginLimiter;

/** Banking H2H endpoints — 30 per minute */
export const bankingRateLimiter = rateLimit({
  ...proxySafeRateLimit,
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Banking API rate limit exceeded.' },
});

/** Webhook receiver — 60 per minute */
export const webhookRateLimiter = rateLimit({
  ...proxySafeRateLimit,
  windowMs: 60 * 1000,
  max: 60,
});

export function auditMiddleware(action: string, category: 'auth' | 'financial' | 'agent' | 'farmer_data' | 'system') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      if (req.user && res.statusCode < 400) {
        logAudit({
          userId: req.user.userId,
          userRole: req.user.role,
          action: action as Parameters<typeof logAudit>[0]['action'],
          category,
          resourceType: req.params.farmerId || req.params.paymentId || undefined,
          resourceId: req.params.id || req.params.paymentId || req.params.farmerId || undefined,
          ipAddress: req.ip,
          success: true,
        });
      }
      return originalJson(body);
    };
    next();
  };
}
