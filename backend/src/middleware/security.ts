import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { logAudit } from '../services/auditService';

/** General API rate limit — 100 requests per minute per IP */
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
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

/** Stricter limit for auth endpoints — relaxed in development */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 10 : 200,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
});

/** Banking H2H endpoints — 30 per minute */
export const bankingRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Banking API rate limit exceeded.' },
});

/** Webhook receiver — 60 per minute */
export const webhookRateLimiter = rateLimit({
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
