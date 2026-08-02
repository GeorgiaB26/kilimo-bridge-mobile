/**
 * Bank MVP routes — canonical paths under /api/aggregation-centres
 * (legacy /api/aggregation/* routes remain for backward compatibility).
 */
import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requirePermission } from '../middleware/auth';
import {
  receiveDelivery,
  listPendingQcDeliveries,
  approveInventoryQuality,
  getFarmerPhone,
  getCentreName,
  findCentreByName,
} from '../services/hierarchyService';
import { sendSms } from '../services/notificationService';
import { findAggregationCentresByLocation } from '../services/aggregationCentreService';

const router = Router();

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

function normalizeQcStatus(raw: string | undefined): 'approved' | 'rejected' | null {
  const s = (raw ?? '').toLowerCase();
  if (['approved', 'passed', 'pass'].includes(s)) return 'approved';
  if (['rejected', 'failed', 'fail'].includes(s)) return 'rejected';
  return null;
}

router.use(authenticate);

/** List aggregation centres filtered by location (registration dropdown). */
router.get(
  '/',
  requirePermission('farmers.read'),
  asyncHandler(async (req, res) => {
    const country = (req.query.country as string)?.trim();
    const county = ((req.query.county ?? req.query.district) as string)?.trim();
    const subcounty = ((req.query.subcounty ?? req.query.sub_county) as string)?.trim();
    if (!country || !county) {
      res.status(400).json({ error: 'country and county (district) are required' });
      return;
    }
    const centres = await findAggregationCentresByLocation(country, county, subcounty || undefined);
    res.json({
      centres: centres.map((c) => ({
        id: c.centre_id,
        centre_id: c.centre_id,
        name: c.name,
        country: c.country,
        county: c.location_level_1,
        subcounty: c.location_level_2,
        location: [c.location_level_1, c.location_level_2].filter(Boolean).join(', '),
      })),
    });
  })
);

async function resolveCentreIdFromUser(req: Request): Promise<string | null> {
  const fromBody = req.body?.centre_id as string | undefined;
  if (fromBody) return fromBody;
  const name = req.user?.aggregationCenter;
  if (!name) return null;
  const centre = (await findCentreByName(name)) as { centre_id?: string } | null;
  return centre?.centre_id ?? null;
}

router.post(
  '/deliveries',
  requirePermission('centres.manage'),
  asyncHandler(async (req, res) => {
    const { farmer_id, centre_id, task_id, product_name, quantity_received, unit, notes } = req.body;
    const resolvedCentreId = centre_id ?? await resolveCentreIdFromUser(req);
    if (!farmer_id || !resolvedCentreId || !product_name || quantity_received == null) {
      res.status(400).json({
        error: 'farmer_id, centre_id, product_name, and quantity_received are required',
      });
      return;
    }
    const record = await receiveDelivery({
      centre_id: resolvedCentreId,
      farmer_id,
      task_id,
      product_name,
      quantity_received: Number(quantity_received),
      unit,
      notes,
      scanned_by_user_id: req.user?.userId,
    });
    const phone = await getFarmerPhone(farmer_id);
    const centreName = (await getCentreName(resolvedCentreId)) ?? 'aggregation centre';
    if (phone) {
      sendSms(phone, `Delivery received at ${centreName}. Thank you!`);
    }
    res.status(201).json({
      delivery_id: (record as { id: string }).id,
      status: 'received',
      delivery: record,
    });
  })
);

router.get(
  '/:centre_id/deliveries',
  requirePermission('centres.read'),
  asyncHandler(async (req, res) => {
    const deliveries = await listPendingQcDeliveries(req.params.centre_id);
    res.json({ centre_id: req.params.centre_id, deliveries });
  })
);

router.patch(
  '/deliveries/:id/quality-check',
  requirePermission('centres.manage'),
  asyncHandler(async (req, res) => {
    const status = normalizeQcStatus(req.body.quality_status);
    if (!status) {
      res.status(400).json({
        error: 'quality_status must be passed/approved or failed/rejected',
      });
      return;
    }
    const record = await approveInventoryQuality(req.params.id, {
      quality_status: status,
      quality_notes: req.body.quality_notes,
      price_per_unit_applied: req.body.price_per_unit_applied,
      marketplace_price_per_unit: req.body.marketplace_price_per_unit,
    });
    if (!record) {
      res.status(404).json({ error: 'Delivery not found' });
      return;
    }
    const phone =
      (record as { farmer_id?: string }).farmer_id
        ? await getFarmerPhone((record as { farmer_id: string }).farmer_id)
        : null;
    if (phone && status === 'approved') {
      const price =
        (record as { marketplace_price_per_unit?: number }).marketplace_price_per_unit ?? 0;
      sendSms(phone, `Your delivery passed quality check. Payment pending (${price} KES/unit).`);
    }
    res.json({
      delivery_id: req.params.id,
      quality_status: status === 'approved' ? 'passed' : 'failed',
      delivery: record,
    });
  })
);

export default router;
