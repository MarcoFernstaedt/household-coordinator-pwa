import { describe, expect, it, vi } from 'vitest';
import { OfflineQueue, type QueueStorage } from '../../src/client/offlineQueue.js';

function memoryStorage(initial: string | null = null): QueueStorage {
  let value: string | null = initial;
  return {
    get: () => value,
    set: (next) => {
      value = next;
    },
  };
}

describe('offline mutation queue', () => {
  it('keeps stable idempotency keys, marks conflicts, and never sends expired guest work', async () => {
    const queue = new OfflineQueue(memoryStorage());
    const owner = queue.enqueue({
      realmId: 'realm-a',
      userId: 'user-a',
      auth: { kind: 'account' },
      method: 'PATCH',
      path: '/api/chores/c1',
      body: { action: 'complete', expectedVersion: 1 },
    });
    const guest = queue.enqueue({
      realmId: 'realm-a',
      userId: 'user-a',
      auth: { kind: 'guest', expiresAt: '2031-01-01T10:00:00.000Z', revoked: false },
      method: 'PATCH',
      path: '/api/groceries/g1',
      body: { checked: true, expectedVersion: 1 },
    });
    expect(owner.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(queue.snapshot().every((item) => item.status === 'pending')).toBe(true);

    const sender = vi.fn(async (item: { id: string }) =>
      item.id === owner.id
        ? { status: 409, body: { currentVersion: 2 } }
        : { status: 200, body: {} },
    );
    await queue.flush(sender, 'realm-a', 'user-a', new Date('2031-01-01T10:00:00.000Z'));
    expect(sender).toHaveBeenCalledTimes(1);
    expect(queue.snapshot()).toEqual([
      expect.objectContaining({ id: owner.id, status: 'conflict', conflictVersion: 2 }),
      expect.objectContaining({ id: guest.id, status: 'blocked', reason: 'guest_expired' }),
    ]);
    queue.retryConflict(owner.id);
    expect(queue.snapshot()[0]).toMatchObject({
      id: owner.id,
      idempotencyKey: owner.idempotencyKey,
      status: 'pending',
      body: { action: 'complete', expectedVersion: 2 },
    });
  });

  it('discards only the explicitly selected local operation', () => {
    const queue = new OfflineQueue(memoryStorage());
    const first = queue.enqueue({
      realmId: 'realm-a',
      userId: 'user-a',
      auth: { kind: 'account' },
      method: 'POST',
      path: '/api/groceries',
      body: { name: 'Rice' },
    });
    const second = queue.enqueue({
      realmId: 'realm-a',
      userId: 'user-a',
      auth: { kind: 'account' },
      method: 'POST',
      path: '/api/groceries',
      body: { name: 'Beans' },
    });
    queue.discard(first.id);
    expect(queue.snapshot()).toEqual([expect.objectContaining({ id: second.id })]);
  });

  it('flushes only the explicitly active household and user pair', async () => {
    const queue = new OfflineQueue(memoryStorage());
    queue.enqueue({
      realmId: 'realm-a',
      userId: 'user-a',
      auth: { kind: 'account' },
      method: 'POST',
      path: '/api/groceries',
      body: { name: 'Rice' },
    });
    queue.enqueue({
      realmId: 'realm-a',
      userId: 'user-b',
      auth: { kind: 'account' },
      method: 'POST',
      path: '/api/groceries',
      body: { name: 'Beans' },
    });
    const sender = vi.fn(async () => ({ status: 200, body: {} }));
    await queue.flush(sender, 'realm-a', 'user-a', new Date());
    expect(sender).toHaveBeenCalledTimes(1);
    expect(queue.snapshot()).toEqual([expect.objectContaining({ userId: 'user-b' })]);
  });

  it('rejects malformed persistence and bounds queued operations', () => {
    const malformed = new OfflineQueue(memoryStorage(JSON.stringify([{ status: 'pending' }])));
    expect(malformed.snapshot()).toEqual([]);

    const queue = new OfflineQueue(memoryStorage());
    for (let index = 0; index < 100; index += 1) {
      queue.enqueue({
        realmId: 'realm-a',
        userId: 'user-a',
        auth: { kind: 'account' },
        method: 'POST',
        path: '/api/groceries',
        body: { name: `Item ${index}` },
      });
    }
    expect(() =>
      queue.enqueue({
        realmId: 'realm-a',
        userId: 'user-a',
        auth: { kind: 'account' },
        method: 'POST',
        path: '/api/groceries',
        body: { name: 'One too many' },
      }),
    ).toThrow('Offline queue limit reached.');
  });

  it('deduplicates replayed enqueue requests by idempotency key', () => {
    const queue = new OfflineQueue(memoryStorage());
    const operation = {
      realmId: 'realm-a',
      userId: 'user-a',
      auth: { kind: 'account' as const },
      method: 'POST' as const,
      path: '/api/groceries',
      body: { name: 'Rice' },
      idempotencyKey: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    };
    queue.enqueue(operation);
    queue.enqueue(operation);
    expect(queue.snapshot()).toHaveLength(1);
  });
});
