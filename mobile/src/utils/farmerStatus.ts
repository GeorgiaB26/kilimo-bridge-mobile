type Variant = 'success' | 'pending' | 'info' | 'warning' | 'danger';

export interface FarmerStatusInfo {
  label: string;
  variant: Variant;
  color: string;
  textColor: string;
  icon: string;
  description: string;
}

const STATUS_MAP: Record<string, FarmerStatusInfo> = {
  pending_review: {
    label: 'Pending Review',
    variant: 'warning',
    color: '#FCD34D',
    textColor: '#000',
    icon: '⏳',
    description: 'Awaiting PM review',
  },
  pending_field_verification: {
    label: 'Pending Field Verification',
    variant: 'warning',
    color: '#FBBF24',
    textColor: '#000',
    icon: '👀',
    description: 'Field agent needs to verify in person',
  },
  verified: {
    label: 'Verified',
    variant: 'success',
    color: '#10B981',
    textColor: '#fff',
    icon: '✅',
    description: 'Verified and approved',
  },
  inactive: {
    label: 'Inactive',
    variant: 'pending',
    color: '#9CA3AF',
    textColor: '#fff',
    icon: '⊘',
    description: 'Inactive account',
  },
  rejected: {
    label: 'Rejected',
    variant: 'danger',
    color: '#EF4444',
    textColor: '#fff',
    icon: '✕',
    description: 'Registration rejected',
  },
};

export function formatFarmerStatus(status?: string | null): FarmerStatusInfo {
  const key = (status ?? '').toLowerCase().replace(/\s+/g, '_');
  if (STATUS_MAP[key]) return STATUS_MAP[key];
  if (status) {
    return {
      label: status,
      variant: 'info',
      color: '#9CA3AF',
      textColor: '#fff',
      icon: '•',
      description: status,
    };
  }
  return {
    label: 'Unknown',
    variant: 'pending',
    color: '#9CA3AF',
    textColor: '#fff',
    icon: '•',
    description: 'Status unknown',
  };
}
