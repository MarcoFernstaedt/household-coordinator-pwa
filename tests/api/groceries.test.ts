import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/server/app.js';

const origin = 'http://localhost:4173';

describe('grocery workflow', () => {
  it('adds, checks, lists, and clears completed items idempotently', async () => {
    const app = await buildApp({ databasePath: ':memory:', allowedOrigins: [origin] });
    const setup = await app.inject({
      method: 'POST',
      url: '/api/setup',
      headers: { origin },
      payload: {
        householdName: 'Cedar House',
        displayName: 'Jamie',
        email: 'jamie@example.test',
        password: 'correct horse battery staple',
      },
    });
    const headers = {
      origin,
      cookie: `household_session=${setup.cookies[0]?.value ?? ''}`,
      'x-csrf-token': setup.json<{ csrfToken: string }>().csrfToken,
    };
    const addHeaders = { ...headers, 'idempotency-key': '55555555-5555-4555-8555-555555555555' };
    const first = await app.inject({
      method: 'POST',
      url: '/api/groceries',
      headers: addHeaders,
      payload: { name: 'Oat milk', quantity: '2 cartons', note: 'Unsweetened' },
    });
    const replay = await app.inject({
      method: 'POST',
      url: '/api/groceries',
      headers: addHeaders,
      payload: { name: 'Oat milk', quantity: '2 cartons', note: 'Unsweetened' },
    });
    expect(first.statusCode).toBe(201);
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual(first.json());
    const item = first.json<{ id: string }>();

    const checked = await app.inject({
      method: 'PATCH',
      url: `/api/groceries/${item.id}`,
      headers: { ...headers, 'idempotency-key': '66666666-6666-4666-8666-666666666666' },
      payload: { checked: true, expectedVersion: 1 },
    });
    expect(checked.json()).toMatchObject({ checked: true, version: 2 });
    const checkedReplay = await app.inject({
      method: 'PATCH',
      url: `/api/groceries/${item.id}`,
      headers: { ...headers, 'idempotency-key': '66666666-6666-4666-8666-666666666666' },
      payload: { checked: true, expectedVersion: 1 },
    });
    expect(checkedReplay.statusCode).toBe(200);
    expect(checkedReplay.json()).toEqual(checked.json());
    const list = await app.inject({
      method: 'GET',
      url: '/api/groceries',
      headers: { cookie: headers.cookie },
    });
    expect(list.json<{ items: unknown[] }>().items).toHaveLength(1);
    const cleared = await app.inject({
      method: 'DELETE',
      url: '/api/groceries/completed',
      headers: { ...headers, 'idempotency-key': '77777777-7777-4777-8777-777777777777' },
    });
    expect(cleared.json()).toEqual({ cleared: 1 });
    const clearedReplay = await app.inject({
      method: 'DELETE',
      url: '/api/groceries/completed',
      headers: { ...headers, 'idempotency-key': '77777777-7777-4777-8777-777777777777' },
    });
    expect(clearedReplay.json()).toEqual({ cleared: 1 });
    await app.close();
  });
});
