import { useEffect, useState } from 'react';
import { subscribeDb } from '../database/db';

/**
 * Custom React hook that forces component re-render when local DB updates
 * (either from local operations, storage events, or BroadcastChannel messages).
 */
export function useDbUpdate(): number {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const unsubscribe = subscribeDb(() => {
      setTick((t) => t + 1);
    });
    return unsubscribe;
  }, []);

  return tick;
}
