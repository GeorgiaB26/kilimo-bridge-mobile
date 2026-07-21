/** Sector → Program → Program Project → Task hierarchy (Phase 2) */

export type ProgramStatus = 'active' | 'paused' | 'completed';
export type TaskStatus =
  | 'not-started'
  | 'in-progress'
  | 'submitted-for-approval'
  | 'approved'
  | 'completed'
  | 'rejected';

export type QualityStatus = 'pending' | 'approved' | 'rejected';

export interface Sector {
  id: string;
  name: string;
  description: string | null;
  country: string | null;
  created_at: string;
}

export interface Program {
  id: string;
  sector_id: string;
  name: string;
  description: string | null;
  status: ProgramStatus;
  sector_name?: string;
  created_at: string;
}

export interface ProgramProject {
  id: string;
  program_id: string;
  name: string;
  region: string | null;
  budget_kes: number | null;
  start_date: string | null;
  end_date: string | null;
  status: ProgramStatus;
  country_manager_id: string | null;
  total_tasks: number;
  completed_tasks: number;
  program_name?: string;
  sector_name?: string;
  farmers_count?: number;
  progress_percent?: number;
  created_at: string;
}

export interface TaskTemplate {
  id: string;
  program_project_id: string;
  name: string;
  description: string | null;
  task_order: number;
  payment_value_kes: number;
  due_date: string | null;
  created_at: string;
}

export interface FarmerTask {
  id: string;
  task_id: string;
  farmer_id: string;
  program_project_id: string;
  name: string;
  description: string | null;
  task_order: number;
  payment_value_kes: number;
  status: TaskStatus;
  due_date: string | null;
  submitted_date: string | null;
  approved_date: string | null;
  completed_date: string | null;
  photo_evidence_url: string | null;
  notes: string | null;
  rejection_reason: string | null;
  program_project_name?: string;
  farmer_name?: string;
}

export interface CentreInventoryItem {
  id: string;
  centre_id: string;
  farmer_id: string;
  task_id: string | null;
  product_name: string;
  quantity_received: number;
  unit: string;
  quality_status: QualityStatus;
  quality_notes: string | null;
  received_date: string | null;
  is_marketplace_ready: boolean;
  marketplace_price_per_unit: number | null;
  farmer_name?: string;
}
