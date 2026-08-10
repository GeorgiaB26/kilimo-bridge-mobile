import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { markThreadRead } from '../services/messagingService';
import {
  createSupportTicket,
  listSupportTicketsForUser,
  getSupportTicketMessages,
  replyToSupportTicket,
  resolveSupportTicket,
  getSupportTicketStats,
  type SupportTicketStatus,
} from '../services/supportTicketService';

const router = Router();
router.use(authenticate);

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

function userOpts(req: Request) {
  return {
    userId: req.user!.userId,
    phoneNumber: req.user!.phoneNumber,
    role: req.user!.role,
  };
}

router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    try {
      const stats = await getSupportTicketStats(userOpts(req));
      res.json({ stats });
    } catch (err) {
      res.status(403).json({ error: err instanceof Error ? err.message : 'Forbidden' });
    }
  })
);

router.get(
  '/tickets',
  asyncHandler(async (req, res) => {
    const statusRaw = typeof req.query.status === 'string' ? req.query.status : undefined;
    const status =
      statusRaw === 'open' || statusRaw === 'resolved'
        ? (statusRaw as SupportTicketStatus)
        : undefined;
    try {
      const tickets = await listSupportTicketsForUser(req.user!.userId, {
        ...userOpts(req),
        status,
      });
      res.json({ tickets });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Could not list tickets' });
    }
  })
);

router.post(
  '/tickets',
  asyncHandler(async (req, res) => {
    const { subject, description, attachmentKeys } = req.body as {
      subject?: string;
      description?: string;
      attachmentKeys?: string[];
    };
    try {
      const result = await createSupportTicket({
        ...userOpts(req),
        subject: subject ?? '',
        description: description ?? '',
        attachmentKeys,
      });
      res.status(201).json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Could not create ticket' });
    }
  })
);

router.get(
  '/tickets/:threadId',
  asyncHandler(async (req, res) => {
    try {
      const result = await getSupportTicketMessages(req.params.threadId, req.user!.userId, userOpts(req));
      await markThreadRead(req.params.threadId, req.user!.userId);
      res.json(result);
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Ticket not found' });
    }
  })
);

router.post(
  '/tickets/:threadId/messages',
  asyncHandler(async (req, res) => {
    const { content, attachmentKeys } = req.body as {
      content?: string;
      attachmentKeys?: string[];
    };
    try {
      const message = await replyToSupportTicket({
        threadId: req.params.threadId,
        ...userOpts(req),
        content: content ?? '',
        attachmentKeys,
      });
      res.status(201).json({ message });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not send message';
      const status = msg.includes('resolved') ? 403 : 400;
      res.status(status).json({ error: msg });
    }
  })
);

router.post(
  '/tickets/:threadId/resolve',
  asyncHandler(async (req, res) => {
    try {
      const ticket = await resolveSupportTicket({
        threadId: req.params.threadId,
        ...userOpts(req),
      });
      res.json({ ticket });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not resolve ticket';
      const status = msg.includes('Only the support desk') ? 403 : 400;
      res.status(status).json({ error: msg });
    }
  })
);

export default router;
