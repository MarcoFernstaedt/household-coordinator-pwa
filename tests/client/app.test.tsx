// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import axeCore from 'axe-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/client/App.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('accessible synthetic demo UI', () => {
  it('supports keyboard-operable completion and reset with no serious axe violations', async () => {
    const map = new Map<string, string>();
    const storage = {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => {
        map.set(key, value);
      },
      removeItem: (key: string) => {
        map.delete(key);
      },
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { container } = render(<App storage={storage} />);
    expect(screen.getByRole('heading', { name: 'Household Coordinator' })).toBeInTheDocument();
    expect(screen.getByText('Synthetic demo — browser only')).toBeInTheDocument();
    const chore = screen.getByRole('checkbox', { name: 'Water the porch fern' });
    fireEvent.click(chore);
    expect(chore).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Reset demo data' }));
    expect(screen.getByRole('checkbox', { name: 'Water the porch fern' })).not.toBeChecked();
    expect(fetchSpy).not.toHaveBeenCalled();
    const result = await axeCore.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(
      result.violations.filter((violation) =>
        ['critical', 'serious'].includes(violation.impact ?? ''),
      ),
    ).toEqual([]);
    fetchSpy.mockRestore();
  });

  it('sets up an account and renders the authenticated workspace', async () => {
    const map = new Map<string, string>();
    const storage = {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => map.set(key, value),
      removeItem: (key: string) => map.delete(key),
    };
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ csrfToken: 'csrf-test', role: 'owner', householdId: 'realm' }),
          {
            status: 201,
            headers: { 'content-type': 'application/json' },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            household: { id: 'realm', name: 'Willow House' },
            user: { id: 'owner', displayName: 'Jordan', role: 'owner' },
            members: [{ id: 'owner', displayName: 'Jordan', role: 'owner' }],
            chores: [],
            groceries: [],
            pets: [],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    const { container } = render(<App storage={storage} />);
    fireEvent.click(screen.getByRole('button', { name: 'Use an account' }));
    expect(screen.getByRole('heading', { name: 'Create a household' })).toHaveFocus();
    fireEvent.change(screen.getByLabelText('Household name'), {
      target: { value: 'Willow House' },
    });
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Jordan' } });
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'jordan@example.test' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'correct horse battery staple' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create household' }));
    expect(
      await screen.findByRole('heading', { name: 'Willow House workspace' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Willow House workspace' })).toHaveFocus();
    expect(screen.getByText('Signed in as Jordan (owner)')).toBeInTheDocument();
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: '11111111-1111-4111-8111-111111111111',
          title: 'Sweep entry',
          dueAt: '2031-05-01T18:00:00.000Z',
          assignedTo: null,
          completedAt: null,
          status: 'open',
          version: 1,
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      ),
    );
    fireEvent.change(screen.getByLabelText('Chore title'), { target: { value: 'Sweep entry' } });
    fireEvent.change(screen.getByLabelText('Due date and time'), {
      target: { value: '2031-05-01T18:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add chore' }));
    expect(await screen.findByText('Sweep entry')).toBeInTheDocument();
    fetchSpy.mockRejectedValueOnce(new TypeError('offline'));
    fireEvent.change(screen.getByLabelText('Grocery item'), { target: { value: 'Rice' } });
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '1 bag' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add grocery item' }));
    expect(await screen.findByText('Pending: Rice')).toBeInTheDocument();
    expect(screen.getByLabelText('Account connection status')).toHaveTextContent(
      'Queued changes: 1',
    );
    expect(screen.getByLabelText('Account connection status')).toHaveTextContent(
      'Connection: offline',
    );
    fetchSpy
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'queued',
            name: 'Rice',
            quantity: '1 bag',
            note: '',
            checked: false,
            version: 1,
          }),
          {
            status: 201,
            headers: { 'content-type': 'application/json' },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            household: { id: 'realm', name: 'Willow House' },
            user: { id: 'owner', displayName: 'Jordan', role: 'owner' },
            members: [{ id: 'owner', displayName: 'Jordan', role: 'owner' }],
            chores: [
              {
                id: '11111111-1111-4111-8111-111111111111',
                title: 'Sweep entry',
                dueAt: '2031-05-01T18:00:00.000Z',
                completedAt: null,
                assignedTo: null,
                version: 1,
              },
            ],
            groceries: [
              {
                id: 'queued',
                name: 'Rice',
                quantity: '1 bag',
                note: '',
                checked: false,
                version: 1,
              },
            ],
            pets: [],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    fireEvent.click(screen.getByRole('button', { name: 'Sync pending changes' }));
    expect(await screen.findByText('Rice')).toBeInTheDocument();
    expect(screen.queryByText('Pending: Rice')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Account connection status')).toHaveTextContent(
      'Queued changes: 0',
    );
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: '11111111-1111-4111-8111-111111111111',
          status: 'completed',
          completedAt: '2031-05-01T17:00:00.000Z',
          version: 2,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Sweep entry' }));
    expect(
      await screen.findByRole('checkbox', { name: 'Sweep entry', checked: true }),
    ).toBeInTheDocument();
    fetchSpy.mockRejectedValueOnce(new TypeError('offline'));
    fireEvent.change(screen.getByLabelText('Grocery item'), { target: { value: 'Beans' } });
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '2 cans' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add grocery item' }));
    expect(await screen.findByText('Pending: Beans')).toBeInTheDocument();
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: 'version_conflict',
          message: 'Changed elsewhere.',
          currentVersion: 2,
        }),
        { status: 409, headers: { 'content-type': 'application/json' } },
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sync pending changes' }));
    expect(await screen.findByText('conflict: Beans')).toBeInTheDocument();
    expect(screen.getByLabelText('Account connection status')).toHaveTextContent('Conflicts: 1');
    expect(
      screen.getByRole('button', { name: 'Retry local change using server version 2' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Discard local change for Beans' }));
    expect(screen.queryByText('Pending: Rice')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Account connection status')).toHaveTextContent(
      'Queued changes: 0',
    );
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'queued', checked: true, version: 2 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Rice' }));
    expect(
      await screen.findByRole('checkbox', { name: 'Rice', checked: true }),
    ).toBeInTheDocument();
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ cleared: 1 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Clear completed groceries' }));
    await waitFor(() =>
      expect(screen.queryByRole('checkbox', { name: 'Rice' })).not.toBeInTheDocument(),
    );
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'grant-1',
          token: 'one-time-opaque-token',
          purpose: 'Shopping helper',
          actions: ['groceries:read'],
          expiresAt: '2031-05-01T19:00:00.000Z',
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      ),
    );
    fireEvent.change(screen.getByLabelText('Guest purpose'), {
      target: { value: 'Shopping helper' },
    });
    fireEvent.change(screen.getByLabelText('Guest expiry'), {
      target: { value: '2031-05-01T19:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create grocery viewing guest' }));
    expect(await screen.findByText('one-time-opaque-token')).toBeInTheDocument();
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 204 }));
    fireEvent.click(screen.getByRole('button', { name: 'Revoke guest now' }));
    expect(
      (await screen.findAllByText('Guest revoked. Further access and sync are blocked.')).length,
    ).toBeGreaterThan(0);
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'pet-1', name: 'Pixel', species: 'dog' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );
    fireEvent.change(screen.getByLabelText('Pet name'), { target: { value: 'Pixel' } });
    fireEvent.change(screen.getByLabelText('Species'), { target: { value: 'dog' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add pet profile' }));
    expect((await screen.findAllByText('Pixel')).length).toBeGreaterThan(0);
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'routine-1',
          kind: 'walk',
          label: 'Evening walk',
          schedule: 'Evening',
          version: 1,
          disclaimer: 'Routine record only — not medical advice.',
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      ),
    );
    fireEvent.change(screen.getByLabelText('Routine label'), { target: { value: 'Evening walk' } });
    fireEvent.change(screen.getByLabelText('Schedule'), { target: { value: 'Evening' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add routine' }));
    expect((await screen.findAllByText(/Evening walk/)).length).toBeGreaterThan(0);
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'routine-1',
          completedAt: '2031-05-01T20:00:00.000Z',
          handoff: 'Walk handled; feeding is next.',
          handoffStatus: 'ready',
          version: 2,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    fireEvent.change(screen.getByLabelText('Handoff note for Evening walk'), {
      target: { value: 'Walk handled; feeding is next.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Complete Evening walk' }));
    expect(await screen.findByText('Handoff: Walk handled; feeding is next.')).toBeInTheDocument();
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'member-1', displayName: 'Sam', role: 'member' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );
    fireEvent.change(screen.getByLabelText('Member name'), { target: { value: 'Sam' } });
    fireEvent.change(screen.getByLabelText('Member email'), {
      target: { value: 'sam@example.test' },
    });
    fireEvent.change(screen.getByLabelText('Temporary member password'), {
      target: { value: 'another correct horse battery staple' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add household member' }));
    expect((await screen.findAllByText('Member Sam created.')).length).toBeGreaterThan(0);
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'chore-member',
          title: 'Take bins out',
          dueAt: '2031-05-02T18:00:00.000Z',
          assignedTo: 'member-1',
          completedAt: null,
          version: 1,
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      ),
    );
    fireEvent.change(screen.getByLabelText('Chore title'), { target: { value: 'Take bins out' } });
    fireEvent.change(screen.getByLabelText('Due date and time'), {
      target: { value: '2031-05-02T18:00' },
    });
    fireEvent.change(screen.getByLabelText('Assign to household member'), {
      target: { value: 'member-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add chore' }));
    expect(await screen.findByRole('checkbox', { name: 'Take bins out' })).toBeInTheDocument();
    const assignedRequestBody = fetchSpy.mock.calls.at(-1)?.[1]?.body;
    expect(typeof assignedRequestBody).toBe('string');
    expect(
      JSON.parse(typeof assignedRequestBody === 'string' ? assignedRequestBody : '{}'),
    ).toMatchObject({
      assignedTo: 'member-1',
    });
    const accountAxe = await axeCore.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(
      accountAxe.violations.filter((violation) =>
        ['critical', 'serious'].includes(violation.impact ?? ''),
      ),
    ).toEqual([]);
    expect(container.querySelectorAll('[aria-live="polite"], [role="status"]')).toHaveLength(1);
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 204 }));
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sign in' })).toHaveFocus();
    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      '/api/setup',
      expect.objectContaining({ method: 'POST', credentials: 'same-origin' }),
    );
  });
});
