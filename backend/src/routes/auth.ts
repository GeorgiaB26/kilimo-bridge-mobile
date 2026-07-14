import { Router, Request, Response } from 'express';
import { requestOtp, verifyOtp, loginWithPassword, devQuickLogin } from '../services/authService';
import { authenticate } from '../middleware/auth';
import { authRateLimiter } from '../middleware/security';
import { logAudit } from '../services/auditService';

const router = Router();

router.post('/request-otp', authRateLimiter, (req: Request, res: Response) => {
  const { phone } = req.body;
  if (!phone) {
    res.status(400).json({ error: 'Phone number is required' });
    return;
  }
  const result = requestOtp(phone);
  if (!result.success) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

router.post('/verify-otp', authRateLimiter, (req: Request, res: Response) => {
  const { phone, code } = req.body;
  if (!phone || !code) {
    res.status(400).json({ error: 'Phone and OTP code are required' });
    return;
  }
  const result = verifyOtp(phone, code, req.ip);
  if (!result.success) {
    res.status(401).json({ error: result.error });
    return;
  }
  res.json({ token: result.token, user: result.user });
});

/** Dev / pilot preview — skip OTP for demo quick-login buttons */
router.post('/dev-login', authRateLimiter, (req: Request, res: Response) => {
  const pilotDemo = process.env.PILOT_OTP === 'true';
  if (process.env.NODE_ENV === 'production' && !pilotDemo) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const { phone } = req.body;
  if (!phone) {
    res.status(400).json({ error: 'Phone is required' });
    return;
  }
  const result = devQuickLogin(phone, req.ip);
  if (!result.success) {
    res.status(401).json({ error: result.error });
    return;
  }
  res.json({ token: result.token, user: result.user });
});

/** Password login for admin/banking roles (bcrypt hashed) */
router.post('/login', authRateLimiter, async (req: Request, res: Response) => {
  const { phone, password } = req.body;
  if (!phone || !password) {
    res.status(400).json({ error: 'Phone and password are required' });
    return;
  }
  const result = await loginWithPassword(phone, password, req.ip);
  if (!result.success) {
    res.status(401).json({ error: result.error });
    return;
  }
  res.json({ token: result.token, user: result.user });
});

router.post('/logout', authenticate, (req: Request, res: Response) => {
  logAudit({
    userId: req.user?.userId,
    userRole: req.user?.role,
    action: 'auth.logout',
    category: 'auth',
    ipAddress: req.ip,
    success: true,
  });
  res.json({ success: true });
});

router.get('/me', authenticate, (req: Request, res: Response) => {
  res.json({ user: req.user });
});

export default router;
