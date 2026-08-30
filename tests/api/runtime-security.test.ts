import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/server/app.js';

describe('runtime security boundary', () => {
  it('reports health and applies defensive headers without exposing implementation errors', async () => {
    const app = await buildApp({
      databasePath: ':memory:',
      allowedOrigins: ['http://localhost:4173'],
    });
    const health = await app.inject({ method: 'GET', url: '/api/health' });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ status: 'ok' });
    expect(health.headers['content-security-policy']).toContain("default-src 'self'");
    expect(health.headers['x-content-type-options']).toBe('nosniff');
    expect(health.headers['referrer-policy']).toBe('no-referrer');
    const broken = await app.inject({
      method: 'POST',
      url: '/api/setup',
      headers: { origin: 'http://localhost:4173' },
      payload: {},
    });
    expect(broken.statusCode).toBe(400);
    expect(broken.body).not.toMatch(/sqlite|stack|node_modules/i);
    await app.close();
  });
});
