import { useEffect, useState } from 'react';
import { subscribeToConnectivity } from '../services/outboxConnectivitySync';

/** null = not yet seeded by the shared NetInfo listener. */
export function useConnectivityOnline(): boolean | null {
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => subscribeToConnectivity(setOnline), []);

  return online;
}
