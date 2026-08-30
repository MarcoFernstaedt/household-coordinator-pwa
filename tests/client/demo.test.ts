import { describe, expect, it } from 'vitest';
import { DEMO_STORAGE_KEY, createDemoStore } from '../../src/client/demo.js';

describe('synthetic demo isolation', () => {
  it('uses deterministic fictional data in a dedicated browser-only store and resets exactly', () => {
    const map = new Map<string, string>();
    const storage = {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => {
        map.set(key, value);
      },
      removeItem: (key: string) => {
        map.delete(key);
      },
    };
    const first = createDemoStore(storage);
    expect(first.snapshot()).toMatchObject({
      household: 'Sunbeam House (Demo)',
      pet: { name: 'Pixel', species: 'dog' },
    });
    first.completeChore('demo-chore-1');
    expect(first.snapshot().chores[0]?.completed).toBe(true);
    expect([...map.keys()]).toEqual([DEMO_STORAGE_KEY]);
    first.reset();
    expect(first.snapshot().chores[0]?.completed).toBe(false);
    expect(createDemoStore(storage).snapshot()).toEqual(first.snapshot());
  });
});
