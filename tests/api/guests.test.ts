import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/server/app.js';

const origin = 'http://localhost:4173';

describe('scoped guest grants', () => {
  it('expires and revokes immediately while denying actions outside the grant', async () => {
    let now = new Date('2031-01-01T10:00:00.000Z');
    const app = await buildApp({
      databasePath: ':memory:',
      allowedOrigins: [origin],
      now: () => now,
    });
    const setup = await app.inject({
      method: 'POST',
      url: '/api/setup',
      headers: { origin },
      payload: {
        householdName: 'Juniper House',
        displayName: 'Morgan',
        email: 'morgan@example.test',
        password: 'correct horse battery staple',
      },
    });
    const auth = {
      origin,
      cookie: `household_session=${setup.cookies[0]?.value ?? ''}`,
      'x-csrf-token': setup.json<{ csrfToken: string }>().csrfToken,
    };
    const grant = await app.inject({
      method: 'POST',
      url: '/api/guests',
      headers: auth,
      payload: {
        purpose: 'Shopping helper',
        actions: ['groceries:read'],
        expiresAt: '2031-01-01T11:00:00.000Z',
      },
    });
    expect(grant.statusCode).toBe(201);
    const { id, token } = grant.json<{ id: string; token: string }>();
    const guestHeaders = { authorization: `Guest ${token}` };
    expect(
      (await app.inject({ method: 'GET', url: '/api/guest/groceries', headers: guestHeaders }))
        .statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/guest/groceries',
          headers: guestHeaders,
          payload: { name: 'Forbidden' },
        })
      ).statusCode,
    ).toBe(403);

    now = new Date('2031-01-01T11:00:00.000Z');
    const expired = await app.inject({
      method: 'GET',
      url: '/api/guest/groceries',
      headers: guestHeaders,
    });
    expect(expired.statusCode).toBe(401);
    expect(expired.json()).toEqual({
      error: 'grant_unavailable',
      message: 'Guest access is unavailable.',
    });

    now = new Date('2031-01-01T10:30:00.000Z');
    const revoke = await app.inject({ method: 'DELETE', url: `/api/guests/${id}`, headers: auth });
    expect(revoke.statusCode).toBe(204);
    const revoked = await app.inject({
      method: 'GET',
      url: '/api/guest/groceries',
      headers: guestHeaders,
    });
    expect(revoked.statusCode).toBe(401);
    expect(revoked.json()).toEqual({
      error: 'grant_unavailable',
      message: 'Guest access is unavailable.',
    });
    await app.close();
  });

  it('compares guest expiry by instant instead of datetime spelling', async () => {
    let now = new Date('2031-01-01T10:00:00.000Z');
    const app = await buildApp({
      databasePath: ':memory:',
      allowedOrigins: [origin],
      now: () => now,
    });
    const setup = await app.inject({
      method: 'POST',
      url: '/api/setup',
      headers: { origin },
      payload: {
        householdName: 'Juniper House',
        displayName: 'Morgan',
        email: 'offset@example.test',
        password: 'correct horse battery staple',
      },
    });
    const auth = {
      origin,
      cookie: `household_session=${setup.cookies[0]?.value ?? ''}`,
      'x-csrf-token': setup.json<{ csrfToken: string }>().csrfToken,
    };
    const grant = await app.inject({
      method: 'POST',
      url: '/api/guests',
      headers: auth,
      payload: {
        purpose: 'Shopping helper',
        actions: ['groceries:read'],
        expiresAt: '2031-01-01T06:00:00-05:00',
      },
    });
    expect(grant.statusCode).toBe(201);
    const opaque = grant.json<{ token: string }>().token;
    now = new Date('2031-01-01T11:00:00.000Z');
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/guest/groceries',
          headers: { authorization: `Guest ${opaque}` },
        })
      ).statusCode,
    ).toBe(401);
    await app.close();
  });
});
