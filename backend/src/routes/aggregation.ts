import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requirePermission } from '../middleware/auth';
import { getAllAggregationCentres } from '../services/aggregationCentreService';
import {
  listCentreInventory,
  receiveDelivery,
  approveInventoryQuality,
  getCentreDashboard,
  findCentreByName,
  listPendingDeliveries,
  getFarmerPhone,
  getCentreName,
} from '../services/hierarchyService';
import { sendSms } from '../services/notificationService';
import { loginWithPassword } from '../services/authService';

const router = Router();

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

router.get(
  '/centres',
  asyncHandler(async (_req, res) => {
    const centres = await getAllAggregationCentres();
    res.json({
      centres: centres.map((c) => ({
        id: c.centre_id,
        centre_id: c.centre_id,
        name: c.name,
        location: [c.location_level_1, c.location_level_2].filter(Boolean).join(', '),
      })),
    });
  })
);

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { centre_id, phone_number, password } = req.body;
    if (!centre_id || !phone_number || !password) {
      res.status(400).json({ error: 'centre_id, phone_number, and password are required' });
      return;
    }
    const centres = await getAllAggregationCentres();
    const centre = centres.find((c) => c.centre_id === centre_id);
    if (!centre) {
      res.status(404).json({ error: 'Centre not found' });
      return;
    }
    const result = await loginWithPassword(phone_number, password, req.ip);
    if (!result.success || !result.token || !result.user) {
      res.status(401).json({ error: result.error ?? 'Invalid credentials' });
      return;
    }
    const roleOk = ['agent', 'admin', 'super_admin', 'platform_admin'].includes(result.user.role);
    if (!roleOk) {
      res.status(403).json({ error: 'Not an aggregation centre account' });
      return;
    }
    if (
      result.user.role === 'agent' &&
      result.user.aggregationCenter &&
      result.user.aggregationCenter !== centre.name
    ) {
      res.status(403).json({ error: 'Account is not linked to this centre' });
      return;
    }
    res.json({
      token: result.token,
      centre_id: centre.centre_id,
      centre_name: centre.name,
      user: {
        ...result.user,
        aggregationCenter: centre.name,
        aggregationCenterId: centre.centre_id,
      },
    });
  })
);

router.use(authenticate);

async function resolveCentreId(req: Request): Promise<string | null> {
  if (req.params.centreId) return req.params.centreId;
  const name = req.user?.aggregationCenter;
  if (!name) return null;
  const centre = (await findCentreByName(name)) as { centre_id?: string } | null;
  return centre?.centre_id ?? null;
}

router.get(
  '/centre/dashboard',
  requirePermission('centres.read'),
  asyncHandler(async (req, res) => {
    const centreId = await resolveCentreId(req);
    if (!centreId) {
      res.status(400).json({ error: 'No aggregation centre linked to your account' });
      return;
    }
    res.json(await getCentreDashboard(centreId));
  })
);

router.get(
  '/centre/pending-deliveries',
  requirePermission('centres.read'),
  asyncHandler(async (req, res) => {
    const centreId = await resolveCentreId(req);
    res.json({ deliveries: await listPendingDeliveries(centreId ?? undefined) });
  })
);

router.get(
  '/centre/:centreId/pending-deliveries',
  requirePermission('centres.read'),
  asyncHandler(async (req, res) => {
    res.json({ deliveries: await listPendingDeliveries(req.params.centreId) });
  })
);

router.get(
  '/centre/inventory',
  requirePermission('centres.read'),
  asyncHandler(async (req, res) => {
    const centreId = await resolveCentreId(req);
    if (!centreId) {
      res.status(400).json({ error: 'Centre ID required' });
      return;
    }
    const status = req.query.status as string | undefined;
    res.json({ inventory: await listCentreInventory(centreId, status) });
  })
);

router.get(
  '/centre/:centreId/inventory',
  requirePermission('centres.read'),
  asyncHandler(async (req, res) => {
    const status = req.query.status as string | undefined;
    res.json({ inventory: await listCentreInventory(req.params.centreId, status) });
  })
);

router.post(
  '/centre/receive-delivery',
  requirePermission('centres.manage'),
  asyncHandler(async (req, res) => {
    const centreId = await resolveCentreId(req);
    if (!centreId) {
      res.status(400).json({ error: 'No aggregation centre linked to your account' });
      return;
    }
    await receiveDeliveryHandler(req, res, centreId);
  })
);

router.post(
  '/centre/:centreId/receive-delivery',
  requirePermission('centres.manage'),
  asyncHandler(async (req, res) => {
    await receiveDeliveryHandler(req, res, req.params.centreId);
  })
);

async function receiveDeliveryHandler(req: Request, res: Response, centreId: string): Promise<void> {
  const { farmer_id, task_id, product_name, quantity, quantity_received, unit, notes } = req.body;
  const qty = quantity_received ?? quantity;
  if (!farmer_id || !product_name || qty == null) {
    res.status(400).json({ error: 'farmer_id, product_name, and quantity are required' });
    return;
  }
  const record = await receiveDelivery({
    centre_id: centreId,
    farmer_id,
    task_id,
    product_name,
    quantity_received: Number(qty),
    unit,
    notes,
    scanned_by_user_id: req.user?.userId,
  });
  const phone = await getFarmerPhone(farmer_id);
  const centreName = (await getCentreName(centreId)) ?? 'aggregation centre';
  if (phone) {
    sendSms(phone, `Delivery received at ${centreName}. Thank you!`);
  }
  res.status(201).json({
    delivery_id: (record as { id: string }).id,
    status: 'received',
    ...(record as object),
  });
}

router.get(
  '/centre/:centreId/dashboard',
  requirePermission('centres.read'),
  asyncHandler(async (req, res) => {
    res.json(await getCentreDashboard(req.params.centreId));
  })
);

router.post(
  '/inventory/:inventoryId/approve-quality',
  requirePermission('centres.manage'),
  asyncHandler(async (req, res) => {
    await approveQualityHandler(req, res);
  })
);

router.post(
  '/centre/:centreId/approve-quality',
  requirePermission('centres.manage'),
  asyncHandler(async (req, res) => {
    await approveQualityHandler(req, res);
  })
);

async function approveQualityHandler(req: Request, res: Response): Promise<void> {
  const { inventory_id, quality_status, quality_notes, marketplace_price_per_unit } = req.body;
  const inventoryId = inventory_id ?? req.params.inventoryId;
  const status = quality_status ?? 'approved';
  if (!['approved', 'rejected'].includes(status)) {
    res.status(400).json({ error: 'quality_status must be approved or rejected' });
    return;
  }
  const record = (await approveInventoryQuality(inventoryId, {
    quality_status: status,
    quality_notes,
    marketplace_price_per_unit,
  })) as {
    farmer_id?: string;
    product_name?: string;
    marketplace_price_per_unit?: number;
    centre_id?: string;
  };
  const phone = record.farmer_id ? await getFarmerPhone(record.farmer_id) : null;
  if (phone && status === 'approved') {
    const price = record.marketplace_price_per_unit ?? 0;
    sendSms(phone, `Your delivery approved! Listed on marketplace at ${price} KES/unit`);
  }
  res.json({ status: status === 'approved' ? 'approved' : 'rejected', ...record });
}

export default router;
