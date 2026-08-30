import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/server/app.js';

const origin = 'http://localhost:4173';

describe('workspace projection', () => {
  it('returns the authenticated household data needed by the account UI', async () => {
    const app = await buildApp({ databasePath: ':memory:', allowedOrigins: [origin] });
    const setup = await app.inject({
      method: 'POST',
      url: '/api/setup',
      headers: { origin },
      payload: {
        householdName: 'Willow House',
        displayName: 'Jordan',
        email: 'workspace@example.test',
        password: 'correct horse battery staple',
      },
    });
    const headers = {
      origin,
      cookie: `household_session=${setup.cookies[0]?.value ?? ''}`,
      'x-csrf-token': setup.json<{ csrfToken: string }>().csrfToken,
    };
    await app.inject({
      method: 'POST',
      url: '/api/chores',
      headers: { ...headers, 'idempotency-key': '11111111-2222-4333-8444-555555555555' },
      payload: { title: 'Sweep entry', dueAt: '2031-05-01T18:00:00.000Z' },
    });
    await app.inject({
      method: 'POST',
      url: '/api/groceries',
      headers: { ...headers, 'idempotency-key': '22222222-3333-4444-8555-666666666666' },
      payload: { name: 'Rice', quantity: '1 bag', note: '' },
    });
    const pet = await app.inject({
      method: 'POST',
      url: '/api/pets',
      headers: { ...headers, 'idempotency-key': '33333333-4444-4555-8666-777777777777' },
      payload: { name: 'Pixel', species: 'dog' },
    });
    await app.inject({
      method: 'POST',
      url: `/api/pets/${pet.json<{ id: string }>().id}/routines`,
      headers: { ...headers, 'idempotency-key': '44444444-5555-4666-8777-888888888888' },
      payload: { kind: 'walk', label: 'Evening walk', schedule: 'Evening' },
    });

    const workspace = await app.inject({
      method: 'GET',
      url: '/api/workspace',
      headers: { cookie: headers.cookie },
    });
    expect(workspace.statusCode).toBe(200);
    expect(workspace.json()).toMatchObject({
      household: { name: 'Willow House' },
      user: { displayName: 'Jordan', role: 'owner' },
      chores: [{ title: 'Sweep entry', version: 1 }],
      groceries: [{ name: 'Rice', version: 1 }],
      pets: [{ name: 'Pixel', routines: [{ label: 'Evening walk', version: 1 }] }],
    });
    await app.close();
  });
});
