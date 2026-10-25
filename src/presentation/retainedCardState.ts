import { useCallback, useState, type SetStateAction } from 'react';

export type CardState = Map<string, unknown>;

/** State belongs to the list, while an offscreen card's DOM can be recycled. */
export function useRetainedCardState<T>(cache: CardState | undefined, key: string, initial: T | (() => T)) {
  const [value, update] = useState<T>(() => {
    if (cache?.has(key)) return cache.get(key) as T;
    const value = initial instanceof Function ? initial() : initial;
    cache?.set(key, value);
    return value;
  });
  const set = useCallback((action: SetStateAction<T>) => {
    update(previous => {
      const next = action instanceof Function ? action(previous) : action;
      cache?.set(key, next);
      return next;
    });
  }, [cache, key]);
  return [value, set] as const;
}
