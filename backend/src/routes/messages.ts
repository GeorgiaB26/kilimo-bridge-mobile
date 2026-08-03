import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import {
  getOrCreateDirectThread,
  listThreadsForUser,
  getThreadMessages,
  markThreadRead,
  sendThreadMessage,
  listMessageableUsers,
  getUnreadMessageCount,
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
  '/threads',
  authenticate,
  asyncHandler(async (req, res) => {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const threads = await listThreadsForUser(req.user!.userId, search);
    res.json({ threads });
  })
);

router.get(
  '/unread-count',
  authenticate,
  asyncHandler(async (req, res) => {
    const count = await getUnreadMessageCount(req.user!.userId);
    res.json({ count });
  })
);

router.get(
  '/contacts',
  authenticate,
  asyncHandler(async (req, res) => {
    const contacts = await listMessageableUsers(
      req.user!.userId,
      req.user!.role,
      req.user!.farmerId,
      req.user!.district,
      req.user!.region
    );
    res.json({ contacts });
  })
);

router.post(
  '/threads',
  authenticate,
  asyncHandler(async (req, res) => {
    const { recipientId, title } = req.body as { recipientId?: string; title?: string };
    if (!recipientId) {
      res.status(400).json({ error: 'recipientId is required' });
      return;
    }
    try {
      const threadId = await getOrCreateDirectThread(req.user!.userId, recipientId, title);
      res.json({ threadId });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Could not create thread' });
    }
  })
);

router.get(
  '/threads/:threadId',
  authenticate,
  asyncHandler(async (req, res) => {
    try {
      const result = await getThreadMessages(req.params.threadId, req.user!.userId);
      await markThreadRead(req.params.threadId, req.user!.userId);
      res.json(result);
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Thread not found' });
    }
  })
);

router.post(
  '/threads/:threadId/messages',
  authenticate,
  asyncHandler(async (req, res) => {
    const { content } = req.body as { content?: string };
    if (!content?.trim()) {
      res.status(400).json({ error: 'content is required' });
      return;
    }
    try {
      const message = await sendThreadMessage(req.params.threadId, req.user!.userId, content);
      res.status(201).json({ message });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Could not send message' });
    }
  })
);

router.post(
  '/threads/:threadId/read',
  authenticate,
  asyncHandler(async (req, res) => {
    try {
      await markThreadRead(req.params.threadId, req.user!.userId);
      res.json({ success: true });
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Thread not found' });
    }
  })
);

export default router;
