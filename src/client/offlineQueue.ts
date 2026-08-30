export interface QueueStorage {
  get(): string | null;
  set(value: string): void;
}

type AccountAuth = { kind: 'account' };
type GuestAuth = { kind: 'guest'; expiresAt: string; revoked: boolean };

type NewOperation = {
  realmId: string;
  userId: string;
  auth: AccountAuth | GuestAuth;
  method: 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body: unknown;
  idempotencyKey?: string;
};

export type QueuedOperation = NewOperation & {
  id: string;
  idempotencyKey: string;
  status: 'pending' | 'syncing' | 'conflict' | 'blocked' | 'failed';
  conflictVersion?: number;
  reason?: string;
};

type SendResult = { status: number; body: Record<string, unknown> };

const MAX_QUEUE_ITEMS = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isQueuedOperation(value: unknown): value is QueuedOperation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  const auth = item.auth;
  const validAuth =
    Boolean(auth) &&
    typeof auth === 'object' &&
    !Array.isArray(auth) &&
    ((auth as Record<string, unknown>).kind === 'account' ||
      ((auth as Record<string, unknown>).kind === 'guest' &&
        typeof (auth as Record<string, unknown>).expiresAt === 'string' &&
        typeof (auth as Record<string, unknown>).revoked === 'boolean'));
  return (
    typeof item.id === 'string' &&
    UUID.test(item.id) &&
    typeof item.idempotencyKey === 'string' &&
    UUID.test(item.idempotencyKey) &&
    typeof item.realmId === 'string' &&
    item.realmId.length > 0 &&
    typeof item.userId === 'string' &&
    item.userId.length > 0 &&
    validAuth &&
    ['POST', 'PATCH', 'DELETE'].includes(String(item.method)) &&
    typeof item.path === 'string' &&
    item.path.startsWith('/api/') &&
    ['pending', 'syncing', 'conflict', 'blocked', 'failed'].includes(String(item.status))
  );
}

export class OfflineQueue {
  private items: QueuedOperation[];

  constructor(private readonly storage: QueueStorage) {
    try {
      const stored = storage.get();
      const parsed: unknown = stored ? JSON.parse(stored) : [];
      if (
        !Array.isArray(parsed) ||
        parsed.length > MAX_QUEUE_ITEMS ||
        !parsed.every(isQueuedOperation)
      )
        throw new Error('Invalid persisted queue.');
      this.items = parsed;
    } catch {
      this.items = [];
      this.persist();
    }
  }

  enqueue(input: NewOperation): QueuedOperation {
    const idempotencyKey = input.idempotencyKey ?? crypto.randomUUID();
    const existing = this.items.find((item) => item.idempotencyKey === idempotencyKey);
    if (existing) return structuredClone(existing);
    if (this.items.length >= MAX_QUEUE_ITEMS) throw new Error('Offline queue limit reached.');
    const item: QueuedOperation = {
      ...structuredClone(input),
      id: crypto.randomUUID(),
      idempotencyKey,
      status: 'pending',
    };
    this.items.push(item);
    this.persist();
    return structuredClone(item);
  }

  snapshot(): QueuedOperation[] {
    return structuredClone(this.items);
  }

  retryConflict(id: string): boolean {
    const item = this.items.find((candidate) => candidate.id === id);
    if (!item || item.status !== 'conflict' || !item.conflictVersion) return false;
    if (!item.body || typeof item.body !== 'object' || Array.isArray(item.body)) return false;
    item.body = { ...item.body, expectedVersion: item.conflictVersion };
    item.status = 'pending';
    delete item.conflictVersion;
    delete item.reason;
    this.persist();
    return true;
  }

  discard(id: string): void {
    this.items = this.items.filter((item) => item.id !== id);
    this.persist();
  }

  async flush(
    sender: (item: QueuedOperation) => Promise<SendResult>,
    activeRealmId: string,
    activeUserId: string,
    now = new Date(),
  ): Promise<void> {
    for (const item of this.items) {
      if (item.realmId !== activeRealmId || item.userId !== activeUserId) continue;
      if (item.status !== 'pending' && item.status !== 'failed') continue;
      if (item.auth.kind === 'guest') {
        if (item.auth.revoked) {
          item.status = 'blocked';
          item.reason = 'guest_revoked';
          continue;
        }
        if (item.auth.expiresAt <= now.toISOString()) {
          item.status = 'blocked';
          item.reason = 'guest_expired';
          continue;
        }
      }
      item.status = 'syncing';
      this.persist();
      try {
        const response = await sender(structuredClone(item));
        if (response.status >= 200 && response.status < 300) {
          this.items = this.items.filter((candidate) => candidate.id !== item.id);
        } else if (response.status === 409) {
          item.status = 'conflict';
          item.conflictVersion = Number(response.body.currentVersion);
        } else if (
          item.auth.kind === 'guest' &&
          (response.status === 401 || response.status === 403)
        ) {
          item.status = 'blocked';
          item.reason = 'guest_unavailable';
        } else {
          item.status = 'failed';
          item.reason = 'server_error';
        }
      } catch {
        item.status = 'pending';
        item.reason = 'offline';
        break;
      }
    }
    this.persist();
  }

  private persist(): void {
    this.storage.set(JSON.stringify(this.items));
  }
}
