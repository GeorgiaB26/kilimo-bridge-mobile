import { Router, Request, Response, NextFunction } from 'express';
import { requestOtp, verifyOtp, loginWithPassword, devQuickLogin } from '../services/authService';
import { resolveTestSwitcherPhone, isDevAuthEnabled } from '../testUserSwitcher';
import { authenticate } from '../middleware/auth';
import { loginLimiter, otpRequestLimiter, otpVerifyLimiter } from '../middleware/security';
import { logAudit } from '../services/auditService';

const router = Router();

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

router.post(
  '/request-otp',
  otpRequestLimiter,
  asyncHandler(async (req, res) => {
    const { phone } = req.body;
    if (!phone) {
      res.status(400).json({ error: 'Phone number is required' });
      return;
    }
    const result = await requestOtp(phone);
    if (!result.success) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  })
);

router.post(
  '/verify-otp',
  otpVerifyLimiter,
  asyncHandler(async (req, res) => {
    const { phone, code } = req.body;
    if (!phone || !code) {
      res.status(400).json({ error: 'Phone and OTP code are required' });
      return;
    }
    const result = await verifyOtp(phone, code, req.ip);
    if (!result.success) {
      res.status(401).json({ error: result.error });
      return;
    }
    res.json({ token: result.token, user: result.user });
  })
);

/** Dev / pilot preview — skip OTP for demo quick-login buttons */
router.post(
  '/dev-login',
  loginLimiter,
  asyncHandler(async (req, res) => {
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
    const result = await devQuickLogin(phone, req.ip);
    if (!result.success) {
      res.status(401).json({ error: result.error });
      return;
    }
    res.json({ token: result.token, user: result.user });
  })
);

/** Dev test switcher — role-based quick login (farmer / field_agent) */
router.post(
  '/dev-token',
  loginLimiter,
  asyncHandler(async (req, res) => {
    if (!isDevAuthEnabled()) {
      res.status(403).json({ error: 'Dev token only in development or pilot mode' });
      return;
    }
    const { phone, role } = req.body as { phone?: string; role?: string };
    const resolvedPhone = phone ?? (role ? resolveTestSwitcherPhone(role) : null);
    if (!resolvedPhone) {
      res.status(400).json({ error: 'phone or role (farmer | field_agent) is required' });
      return;
    }
    const result = await devQuickLogin(resolvedPhone, req.ip);
    if (!result.success) {
      res.status(401).json({ error: result.error });
      return;
    }
    const roleLabel = role ?? result.user?.role ?? 'user';
    res.json({
      status: 'success',
      token: result.token,
      user: result.user,
      message: `Logged in as ${roleLabel} (dev mode)`,
    });
  })
);

/** Password login for admin/banking roles (bcrypt hashed) */
router.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
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
  })
);

router.post(
  '/logout',
  authenticate,
  asyncHandler(async (req, res) => {
    await logAudit({
      userId: req.user?.userId,
      userRole: req.user?.role,
      action: 'auth.logout',
      category: 'auth',
      ipAddress: req.ip,
      success: true,
    });
    res.json({ success: true });
  })
);

router.get('/me', authenticate, (req: Request, res: Response) => {
  res.json({ user: req.user });
});

export default router;
