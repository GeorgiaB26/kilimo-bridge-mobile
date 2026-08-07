import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import {
  getUserNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
} from '../services/notificationService';
import {
  getNotificationSettings,
  updateNotificationSettings,
} from '../services/messagingService';

const router = Router();

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const unreadOnly = req.query.unread === 'true';
    const notifications = await getUserNotifications(req.user!.userId, 100, unreadOnly);
    res.json({ notifications });
  })
);

router.get(
  '/unread-count',
  authenticate,
  asyncHandler(async (req, res) => {
    const count = await getUnreadNotificationCount(req.user!.userId);
    res.json({ count });
  })
);

router.post(
  '/:id/read',
  authenticate,
  asyncHandler(async (req, res) => {
    const ok = await markNotificationRead(req.params.id, req.user!.userId);
    if (!ok) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }
    res.json({ success: true });
  })
);

router.post(
  '/read-all',
  authenticate,
  asyncHandler(async (req, res) => {
    await markAllNotificationsRead(req.user!.userId);
    res.json({ success: true });
  })
);

router.get(
  '/settings',
  authenticate,
  asyncHandler(async (req, res) => {
    const settings = await getNotificationSettings(req.user!.userId);
    res.json({ settings });
  })
);

router.patch(
  '/settings',
  authenticate,
  asyncHandler(async (req, res) => {
    const settings = await updateNotificationSettings(req.user!.userId, req.body);
    res.json({ settings });
  })
);

export default router;
