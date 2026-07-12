export interface FarmerProject {
  id?: string;
  project_name: string;
  payment_amount: number;
  status: string;
  completion_percentage: number;
  due_date?: string;
  start_date?: string;
  payment_status?: string;
  earnings_amount?: number;
  completed_at?: string;
  project_id?: string;
}

export const PROJECT_DESCRIPTIONS: Record<string, string> = {
  'Coffee Training': 'Learn sustainable coffee farming techniques, harvesting best practices, and quality grading to maximise your crop value at the aggregation centre.',
  'Soil Health': 'Improve soil fertility through composting, crop rotation, and organic amendments. Includes field visits and soil testing support.',
  'Baseline Survey': 'Complete a farm baseline assessment covering land size, crops, and household income to qualify for cooperative programmes.',
  'Water Conservation': 'Install and maintain water-saving irrigation methods suited to your region and crop type.',
  'Pest Management': 'Integrated pest management training with safe, affordable methods to protect crops without harming the environment.',
};
