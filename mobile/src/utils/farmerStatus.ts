type Variant = 'success' | 'pending' | 'info' | 'warning' | 'danger';

const STATUS_MAP: Record<string, { label: string; variant: Variant; color: string }> = {
  pending_review: { label: 'Pending Review', variant: 'warning', color: '#FCD34D' },
  pending_field_verification: { label: 'Pending Field Verification', variant: 'warning', color: '#FBBF24' },
  verified: { label: 'Verified', variant: 'success', color: '#10B981' },
  inactive: { label: 'Inactive', variant: 'pending', color: '#9CA3AF' },
  rejected: { label: 'Rejected', variant: 'danger', color: '#EF4444' },
};

export function formatFarmerStatus(status?: string | null): { label: string; variant: Variant; color: string } {
  const key = (status ?? '').toLowerCase().replace(/\s+/g, '_');
  if (STATUS_MAP[key]) return STATUS_MAP[key];
  if (status) return { label: status, variant: 'info', color: '#9CA3AF' };
  return { label: 'Unknown', variant: 'pending', color: '#9CA3AF' };
}
