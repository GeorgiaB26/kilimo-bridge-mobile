export type OfflineFarmerMatch = {
  name?: string;
  phone_number?: string;
  district?: string;
  membership_group_name?: string;
  kb_farmer_id?: string;
  country?: string;
};

export function farmerMatchesOfflineQuery(farmer: OfflineFarmerMatch, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const digits = q.replace(/\D/g, '');
  const haystacks = [
    farmer.name,
    farmer.phone_number,
    farmer.district,
    farmer.membership_group_name,
    farmer.kb_farmer_id,
    farmer.country,
  ];
  if (haystacks.some((v) => v?.toLowerCase().includes(q))) return true;
  if (digits.length >= 3 && farmer.phone_number?.replace(/\D/g, '').includes(digits)) return true;
  return q.split(/\s+/).some((part) => part.length >= 2 && farmer.name?.toLowerCase().includes(part));
}

/** Lightweight cache fallback only — does not reproduce project enrolment filtering. */
export function filterFarmersOffline<T extends OfflineFarmerMatch>(
  farmers: T[],
  opts: { country?: string; q?: string; membershipGroupName?: string }
): T[] {
  let list = farmers;
  if (opts.country) {
    list = list.filter((f) => f.country === opts.country);
  }
  if (opts.membershipGroupName) {
    const name = opts.membershipGroupName.toLowerCase();
    list = list.filter((f) => f.membership_group_name?.toLowerCase() === name);
  }
  if (opts.q?.trim()) {
    list = list.filter((f) => farmerMatchesOfflineQuery(f, opts.q!));
  }
  return list;
}
