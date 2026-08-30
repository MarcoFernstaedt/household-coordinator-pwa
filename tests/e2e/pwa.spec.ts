import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { z } from 'zod';

test('built PWA demo is isolated, accessible, responsive, and offline-capable', async ({
  page,
  context,
  browserName,
}) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(`${request.method()} ${request.url()}`));
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Household Coordinator' })).toBeVisible();
  await expect(page.getByText('Synthetic demo — browser only')).toBeVisible();
  await page.getByRole('checkbox', { name: 'Water the porch fern' }).check();
  await expect(page.getByRole('checkbox', { name: 'Water the porch fern' })).toBeChecked();
  expect(
    requests.filter((entry) => !entry.startsWith('GET ') && !entry.startsWith('HEAD ')),
  ).toEqual([]);
  expect(requests.filter((entry) => entry.includes('/api/'))).toEqual([]);

  await page.setViewportSize({ width: 320, height: 800 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(
    accessibility.violations.filter((item) => ['critical', 'serious'].includes(item.impact ?? '')),
  ).toEqual([]);

  await page.getByRole('button', { name: 'Use an account' }).click();
  await expect(page.getByRole('heading', { name: 'Create a household' })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  const accountAccessibility = await new AxeBuilder({ page }).analyze();
  expect(
    accountAccessibility.violations.filter((item) =>
      ['critical', 'serious'].includes(item.impact ?? ''),
    ),
  ).toEqual([]);
  await page.getByRole('button', { name: 'Return to synthetic demo' }).click();
  await expect(page.getByText('Synthetic demo — browser only')).toBeVisible();
  await expect(page.locator('#main')).toBeFocused();

  if (browserName === 'chromium') {
    await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
    await expect(page.getByRole('button', { name: 'Reset demo data' })).toBeVisible();
    await page.emulateMedia({ reducedMotion: 'no-preference', forcedColors: 'none' });
  }
  await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) throw new Error('Service workers are unavailable.');
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
          once: true,
        }),
      );
    }
  });
  const cachedEntries = await page.evaluate(async () => {
    const keys = await caches.keys();
    const entries: Array<{ path: string; bytes: number }> = [];
    for (const key of keys) {
      const cache = await caches.open(key);
      for (const request of await cache.keys()) {
        const response = await cache.match(request);
        entries.push({
          path: new URL(request.url).pathname,
          bytes: response ? (await response.clone().arrayBuffer()).byteLength : 0,
        });
      }
    }
    return entries.sort((a, b) => a.path.localeCompare(b.path));
  });
  const cachedUrls = cachedEntries.map((entry) => entry.path);
  expect(cachedUrls).toEqual(expect.arrayContaining(['/', '/manifest.webmanifest', '/icon.svg']));
  expect(cachedUrls.some((url) => url.startsWith('/assets/') && url.endsWith('.js'))).toBe(true);
  expect(cachedUrls.some((url) => url.startsWith('/assets/') && url.endsWith('.css'))).toBe(true);
  expect(cachedEntries.every((entry) => entry.bytes > 0)).toBe(true);
  if (browserName === 'firefox') {
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Household Coordinator' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Water the porch fern' })).toBeChecked();
  } else {
    const cachedAppBytes = cachedEntries
      .filter((entry) => entry.path === '/' || entry.path.startsWith('/assets/'))
      .reduce((total, entry) => total + entry.bytes, 0);
    expect(cachedAppBytes).toBeGreaterThan(100_000);
  }
  expect(errors).toEqual([]);
});

test('authenticated account states reflow and recover accessibly', async ({
  page,
  browserName,
}) => {
  let online = false;
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/setup') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ csrfToken: 'csrf-browser', role: 'owner', householdId: 'realm' }),
      });
      return;
    }
    if (path === '/api/workspace') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          household: { id: 'realm', name: 'Willow House' },
          user: { id: 'owner', displayName: 'Jordan', role: 'owner' },
          members: [{ id: 'owner', displayName: 'Jordan', role: 'owner' }],
          chores: [],
          groceries: [],
          pets: [],
        }),
      });
      return;
    }
    if (path === '/api/groceries') {
      if (!online) await route.abort('internetdisconnected');
      else
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'version_conflict',
            message: 'Changed on another device.',
            currentVersion: 2,
          }),
        });
      return;
    }
    if (path === '/api/guests' && request.method() === 'POST') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'guest-1',
          token: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_long',
          purpose: 'Shopping helper',
          actions: ['groceries:read'],
          expiresAt: '2031-05-01T19:00:00.000Z',
        }),
      });
      return;
    }
    if (path === '/api/guests/guest-1' && request.method() === 'DELETE') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Use an account' }).click();
  await page.getByLabel('Household name').fill('Willow House');
  await page.getByLabel('Your name').fill('Jordan');
  await page.getByLabel('Email address').fill('jordan@example.test');
  await page.getByLabel('Password').fill('correct horse battery staple');
  await page.getByRole('button', { name: 'Create household' }).click();
  await expect(page.getByRole('heading', { name: 'Willow House workspace' })).toBeFocused();

  await page.getByLabel('Grocery item').fill('Rice');
  await page.getByLabel('Quantity').fill('1 bag');
  await page.getByRole('button', { name: 'Add grocery item' }).click();
  await expect(page.getByText('Pending: Rice')).toBeVisible();
  await expect(page.getByLabel('Account connection status')).toContainText('Connection: offline');
  online = true;
  await page.getByRole('button', { name: 'Sync pending changes' }).click();
  await expect(page.getByText('conflict: Rice')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Retry local change using server version 2' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Discard local change for Rice' })).toBeVisible();
  await page.getByRole('button', { name: 'Retry local change using server version 2' }).click();
  await expect(page.getByRole('button', { name: 'Sync pending changes' })).toBeFocused();
  await page.getByRole('button', { name: 'Sync pending changes' }).click();
  await expect(page.getByText('conflict: Rice')).toBeVisible();
  await page.getByRole('button', { name: 'Discard local change for Rice' }).click();
  await expect(page.getByRole('heading', { name: 'Groceries' })).toBeFocused();

  await page.getByLabel('Guest purpose').fill('Shopping helper');
  await page.getByLabel('Guest expiry').fill('2031-05-01T19:00');
  await page.getByRole('button', { name: 'Create grocery viewing guest' }).click();
  await expect(page.getByText(/abcdefghijklmnopqrstuvwxyz/)).toBeVisible();
  await page.setViewportSize({ width: 320, height: 800 });
  const reflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    offenders: [...document.querySelectorAll<HTMLElement>('body *')]
      .filter(
        (element) => element.getBoundingClientRect().right > document.documentElement.clientWidth,
      )
      .slice(0, 8)
      .map((element) => ({
        tag: element.tagName,
        className: element.className,
        text: element.textContent?.trim().slice(0, 80),
        right: element.getBoundingClientRect().right,
      })),
  }));
  expect(reflow.scrollWidth, JSON.stringify(reflow)).toBeLessThanOrEqual(reflow.clientWidth);
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(
    accessibility.violations.filter((item) => ['critical', 'serious'].includes(item.impact ?? '')),
  ).toEqual([]);
  if (browserName === 'chromium') {
    await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
    await expect(page.getByRole('button', { name: 'Revoke guest now' })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Revoke guest now' }).click();
  await expect(page.getByRole('heading', { name: 'Temporary grocery viewer' })).toBeFocused();
  await expect(
    page
      .getByRole('region', { name: 'Temporary grocery viewer' })
      .getByText('Guest revoked. Further access and sync are blocked.'),
  ).toBeVisible();
});

test('manifest declares a standalone install surface', async ({ request }) => {
  const response = await request.get('/manifest.webmanifest');
  expect(response.ok()).toBe(true);
  const manifest = z
    .object({
      name: z.string(),
      display: z.string(),
      scope: z.string(),
      icons: z.array(z.object({ src: z.string() })),
    })
    .parse(await response.json());
  expect(manifest).toMatchObject({
    name: 'Household Coordinator',
    display: 'standalone',
    scope: '/',
  });
  expect(manifest.icons.length).toBeGreaterThan(0);
});
