import { Router, Request, Response } from 'express';
import { requestOtp, verifyOtp } from '../services/authService';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post('/request-otp', (req: Request, res: Response) => {
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

router.post('/verify-otp', (req: Request, res: Response) => {
  const { phone, code } = req.body;
  if (!phone || !code) {
    res.status(400).json({ error: 'Phone and OTP code are required' });
    return;
  }
  const result = verifyOtp(phone, code);
  if (!result.success) {
    res.status(401).json({ error: result.error });
    return;
  }
  res.json({ token: result.token, user: result.user });
});

router.get('/me', authenticate, (req: Request, res: Response) => {
  res.json({ user: req.user });
});

export default router;
