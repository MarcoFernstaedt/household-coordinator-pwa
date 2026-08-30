import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/server/app.js';

const origin = 'http://localhost:4173';

describe('generic pet-care workflow', () => {
  it('creates a fictional pet routine and records completion handoff without medical claims', async () => {
    const app = await buildApp({ databasePath: ':memory:', allowedOrigins: [origin] });
    const setup = await app.inject({
      method: 'POST',
      url: '/api/setup',
      headers: { origin },
      payload: {
        householdName: 'Birch Home',
        displayName: 'Riley',
        email: 'riley@example.test',
        password: 'correct horse battery staple',
      },
    });
    const auth = {
      origin,
      cookie: `household_session=${setup.cookies[0]?.value ?? ''}`,
      'x-csrf-token': setup.json<{ csrfToken: string }>().csrfToken,
    };
    const pet = await app.inject({
      method: 'POST',
      url: '/api/pets',
      headers: { ...auth, 'idempotency-key': '88888888-8888-4888-8888-888888888888' },
      payload: { name: 'Pixel', species: 'dog' },
    });
    expect(pet.statusCode).toBe(201);
    const petReplay = await app.inject({
      method: 'POST',
      url: '/api/pets',
      headers: { ...auth, 'idempotency-key': '88888888-8888-4888-8888-888888888888' },
      payload: { name: 'Pixel', species: 'dog' },
    });
    expect(petReplay.statusCode).toBe(200);
    expect(petReplay.json()).toEqual(pet.json());
    const petId = pet.json<{ id: string }>().id;
    const routine = await app.inject({
      method: 'POST',
      url: `/api/pets/${petId}/routines`,
      headers: { ...auth, 'idempotency-key': '99999999-9999-4999-8999-999999999999' },
      payload: {
        kind: 'medication-note',
        label: 'Record routine supplement note',
        schedule: 'Evening',
      },
    });
    expect(routine.statusCode).toBe(201);
    expect(routine.json()).toMatchObject({
      kind: 'medication-note',
      disclaimer: 'Routine record only — not medical advice.',
    });
    const routineReplay = await app.inject({
      method: 'POST',
      url: `/api/pets/${petId}/routines`,
      headers: { ...auth, 'idempotency-key': '99999999-9999-4999-8999-999999999999' },
      payload: {
        kind: 'medication-note',
        label: 'Record routine supplement note',
        schedule: 'Evening',
      },
    });
    expect(routineReplay.statusCode).toBe(200);
    expect(routineReplay.json()).toEqual(routine.json());
    const routineId = routine.json<{ id: string }>().id;
    const completed = await app.inject({
      method: 'POST',
      url: `/api/pet-routines/${routineId}/completions`,
      headers: { ...auth, 'idempotency-key': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      payload: { expectedVersion: 1, handoff: 'Completed; next person can handle the walk.' },
    });
    expect(completed.json()).toMatchObject({ version: 2, handoffStatus: 'ready' });
    const completedReplay = await app.inject({
      method: 'POST',
      url: `/api/pet-routines/${routineId}/completions`,
      headers: { ...auth, 'idempotency-key': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      payload: { expectedVersion: 1, handoff: 'Completed; next person can handle the walk.' },
    });
    expect(completedReplay.statusCode).toBe(200);
    expect(completedReplay.json()).toEqual(completed.json());
    await app.close();
  });
});
