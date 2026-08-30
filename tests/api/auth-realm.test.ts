import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/server/app.js';

async function setupOwner(app: Awaited<ReturnType<typeof buildApp>>, email: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/setup',
    headers: { origin: 'http://localhost:4173' },
    payload: {
      householdName: 'Fictional Household',
      displayName: 'Owner',
      email,
      password: 'correct horse battery staple',
    },
  });
  expect(response.statusCode).toBe(201);
  return {
    cookie: response.cookies[0]?.value ?? '',
    csrf: response.json<{ csrfToken: string }>().csrfToken,
  };
}

describe('owner setup and realm authorization', () => {
  it('creates an owner session and refuses access to another household record', async () => {
    const app = await buildApp({
      databasePath: ':memory:',
      allowedOrigins: ['http://localhost:4173'],
    });
    const first = await setupOwner(app, 'owner1@example.test');
    const second = await setupOwner(app, 'owner2@example.test');

    const created = await app.inject({
      method: 'POST',
      url: '/api/chores',
      headers: {
        origin: 'http://localhost:4173',
        cookie: `household_session=${first.cookie}`,
        'x-csrf-token': first.csrf,
        'idempotency-key': '11111111-1111-4111-8111-111111111111',
      },
      payload: { title: 'Water the porch fern', dueAt: '2031-05-01T18:00:00.000Z' },
    });
    expect(created.statusCode).toBe(201);
    const choreId = created.json<{ id: string }>().id;

    const denied = await app.inject({
      method: 'GET',
      url: `/api/chores/${choreId}`,
      headers: { cookie: `household_session=${second.cookie}` },
    });
    expect(denied.statusCode).toBe(404);
    expect(denied.json()).toEqual({ error: 'not_found', message: 'Record not found.' });
    await app.close();
  });

  it('rejects login from a missing or foreign origin', async () => {
    const app = await buildApp({
      databasePath: ':memory:',
      allowedOrigins: ['http://localhost:4173'],
    });
    await setupOwner(app, 'origin@example.test');
    const missing = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'origin@example.test', password: 'correct horse battery staple' },
    });
    expect(missing.statusCode).toBe(403);
    const foreign = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin: 'https://foreign.example.test' },
      payload: { email: 'origin@example.test', password: 'correct horse battery staple' },
    });
    expect(foreign.statusCode).toBe(403);
    await app.close();
  });

  it('revokes the active session on logout', async () => {
    const app = await buildApp({
      databasePath: ':memory:',
      allowedOrigins: ['http://localhost:4173'],
    });
    const owner = await setupOwner(app, 'logout@example.test');
    const headers = {
      origin: 'http://localhost:4173',
      cookie: `household_session=${owner.cookie}`,
      'x-csrf-token': owner.csrf,
    };
    const logout = await app.inject({ method: 'POST', url: '/api/auth/logout', headers });
    expect(logout.statusCode).toBe(204);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/chores/11111111-1111-4111-8111-111111111111`,
          headers: { cookie: headers.cookie },
        })
      ).statusCode,
    ).toBe(401);
    await app.close();
  });
});
