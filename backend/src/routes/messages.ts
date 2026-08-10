import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { isAgentRole } from '../../../shared/src/roles';
import {
  getOrCreateDirectThread,
  listThreadsForUser,
  getThreadMessages,
  markThreadRead,
  sendThreadMessage,
  listMessageableUsers,
  agentCanMessageRecipient,
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
    const threads = await listThreadsForUser(
      req.user!.userId,
      search,
      req.user!.role,
      req.user!.region,
      req.user!.district
    );
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
    if (isAgentRole(req.user!.role)) {
      const allowed = await agentCanMessageRecipient(
        req.user!.userId,
        recipientId,
        req.user!.region,
        req.user!.district
      );
      if (!allowed) {
        res.status(403).json({
          error: 'You can only message your project manager or farmers you registered',
        });
        return;
      }
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
    const { content, attachment_url } = req.body as {
      content?: string;
      attachment_url?: string;
    };
    if (!content?.trim() && !attachment_url?.trim()) {
      res.status(400).json({ error: 'content is required' });
      return;
    }
    try {
      const message = await sendThreadMessage(
        req.params.threadId,
        req.user!.userId,
        content ?? '',
        attachment_url
      );
      res.status(201).json({ message });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not send message';
      const status = msg.includes('resolved') ? 403 : 400;
      res.status(status).json({ error: msg });
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
