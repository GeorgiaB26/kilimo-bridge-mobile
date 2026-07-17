import { Router, Request, Response } from 'express';
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

const router = Router();

router.get('/centres', authenticate, requirePermission('centres.read'), (_req: Request, res: Response) => {
  res.json({ centres: getAllAggregationCentres() });
});

router.use(authenticate);

function resolveCentreId(req: Request): string | null {
  if (req.params.centreId) return req.params.centreId;
  const name = req.user?.aggregationCenter;
  if (!name) return null;
  const centre = findCentreByName(name) as { centre_id?: string } | undefined;
  return centre?.centre_id ?? null;
}

router.get('/centre/dashboard', requirePermission('centres.read'), (req: Request, res: Response) => {
  const centreId = resolveCentreId(req);
  if (!centreId) {
    res.status(400).json({ error: 'No aggregation centre linked to your account' });
    return;
  }
  res.json(getCentreDashboard(centreId));
});

router.get('/centre/pending-deliveries', requirePermission('centres.read'), (_req: Request, res: Response) => {
  res.json({ deliveries: listPendingDeliveries() });
});

router.get('/centre/:centreId/pending-deliveries', requirePermission('centres.read'), (_req: Request, res: Response) => {
  res.json({ deliveries: listPendingDeliveries() });
});

router.get('/centre/inventory', requirePermission('centres.read'), (req: Request, res: Response) => {
  const centreId = resolveCentreId(req);
  if (!centreId) {
    res.status(400).json({ error: 'No aggregation centre linked to your account' });
    return;
  }
  res.json({ inventory: listCentreInventory(centreId) });
});

router.post('/centre/receive-delivery', requirePermission('centres.manage'), (req: Request, res: Response) => {
  const centreId = resolveCentreId(req);
  if (!centreId) {
    res.status(400).json({ error: 'No aggregation centre linked to your account' });
    return;
  }
  const { farmer_id, task_id, product_name, quantity_received, unit, notes } = req.body;
  if (!farmer_id || !product_name || quantity_received == null) {
    res.status(400).json({ error: 'farmer_id, product_name, and quantity_received are required' });
    return;
  }
  const record = receiveDelivery({
    centre_id: centreId,
    farmer_id,
    task_id,
    product_name,
    quantity_received: Number(quantity_received),
    unit,
    notes,
    scanned_by_user_id: req.user?.userId,
  });
  const phone = getFarmerPhone(farmer_id);
  if (phone) {
    sendSms(phone, `Delivery received at ${getCentreName(centreId) ?? 'aggregation centre'}. Thank you!`);
  }
  res.status(201).json(record);
});

router.get('/centre/:centreId/inventory', requirePermission('centres.read'), (req: Request, res: Response) => {
  res.json({ inventory: listCentreInventory(req.params.centreId) });
});

router.get('/centre/:centreId/dashboard', requirePermission('centres.read'), (req: Request, res: Response) => {
  res.json(getCentreDashboard(req.params.centreId));
});

router.post('/centre/:centreId/receive-delivery', requirePermission('centres.manage'), (req: Request, res: Response) => {
  const { farmer_id, task_id, product_name, quantity_received, unit, notes } = req.body;
  if (!farmer_id || !product_name || quantity_received == null) {
    res.status(400).json({ error: 'farmer_id, product_name, and quantity_received are required' });
    return;
  }
  const record = receiveDelivery({
    centre_id: req.params.centreId,
    farmer_id,
    task_id,
    product_name,
    quantity_received: Number(quantity_received),
    unit,
    notes,
    scanned_by_user_id: req.user?.userId,
  });
  const phone = getFarmerPhone(farmer_id);
  if (phone) {
    sendSms(phone, `Delivery received at ${getCentreName(req.params.centreId) ?? 'aggregation centre'}. Thank you!`);
  }
  res.status(201).json(record);
});

router.post('/inventory/:inventoryId/approve-quality', requirePermission('centres.manage'), (req: Request, res: Response) => {
  const { quality_status, quality_notes, marketplace_price_per_unit } = req.body;
  if (!quality_status || !['approved', 'rejected'].includes(quality_status)) {
    res.status(400).json({ error: 'quality_status must be approved or rejected' });
    return;
  }
  res.json(approveInventoryQuality(req.params.inventoryId, {
    quality_status,
    quality_notes,
    marketplace_price_per_unit,
  }));
});

export default router;
