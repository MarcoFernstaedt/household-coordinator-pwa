import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/server/app.js';

const origin = 'http://localhost:4173';

async function setup(app: Awaited<ReturnType<typeof buildApp>>) {
  const owner = await app.inject({
    method: 'POST',
    url: '/api/setup',
    headers: { origin },
    payload: {
      householdName: 'Maple Street',
      displayName: 'Alex',
      email: 'alex@example.test',
      password: 'correct horse battery staple',
    },
  });
  const ownerAuth = {
    cookie: `household_session=${owner.cookies[0]?.value ?? ''}`,
    csrf: owner.json<{ csrfToken: string }>().csrfToken,
  };
  const member = await app.inject({
    method: 'POST',
    url: '/api/members',
    headers: { origin, cookie: ownerAuth.cookie, 'x-csrf-token': ownerAuth.csrf },
    payload: {
      displayName: 'Sam',
      email: 'sam@example.test',
      password: 'another correct horse battery staple',
    },
  });
  expect(member.statusCode).toBe(201);
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { origin },
    payload: { email: 'sam@example.test', password: 'another correct horse battery staple' },
  });
  return {
    ownerAuth,
    memberId: member.json<{ id: string }>().id,
    memberAuth: {
      cookie: `household_session=${login.cookies[0]?.value ?? ''}`,
      csrf: login.json<{ csrfToken: string }>().csrfToken,
    },
  };
}

describe('chore workflow', () => {
  it('lets an owner assign and a member complete while rejecting stale versions', async () => {
    const app = await buildApp({ databasePath: ':memory:', allowedOrigins: [origin] });
    const { ownerAuth, memberId, memberAuth } = await setup(app);
    const created = await app.inject({
      method: 'POST',
      url: '/api/chores',
      headers: {
        origin,
        cookie: ownerAuth.cookie,
        'x-csrf-token': ownerAuth.csrf,
        'idempotency-key': '22222222-2222-4222-8222-222222222222',
      },
      payload: {
        title: 'Take recycling out',
        dueAt: '2031-05-02T18:00:00.000Z',
        assignedTo: memberId,
      },
    });
    expect(created.statusCode).toBe(201);
    const chore = created.json<{ id: string; version: number }>();

    const completed = await app.inject({
      method: 'PATCH',
      url: `/api/chores/${chore.id}`,
      headers: {
        origin,
        cookie: memberAuth.cookie,
        'x-csrf-token': memberAuth.csrf,
        'idempotency-key': '33333333-3333-4333-8333-333333333333',
      },
      payload: { action: 'complete', expectedVersion: 1 },
    });
    expect(completed.statusCode).toBe(200);
    expect(completed.json()).toMatchObject({ version: 2, status: 'completed' });
    const replay = await app.inject({
      method: 'PATCH',
      url: `/api/chores/${chore.id}`,
      headers: {
        origin,
        cookie: memberAuth.cookie,
        'x-csrf-token': memberAuth.csrf,
        'idempotency-key': '33333333-3333-4333-8333-333333333333',
      },
      payload: { action: 'complete', expectedVersion: 1 },
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual(completed.json());

    const stale = await app.inject({
      method: 'PATCH',
      url: `/api/chores/${chore.id}`,
      headers: {
        origin,
        cookie: ownerAuth.cookie,
        'x-csrf-token': ownerAuth.csrf,
        'idempotency-key': '44444444-4444-4444-8444-444444444444',
      },
      payload: { action: 'reopen', expectedVersion: 1 },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ error: 'version_conflict', currentVersion: 2 });
    await app.close();
  });
});
