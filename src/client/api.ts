export type Workspace = {
  household: { id: string; name: string };
  user: { id: string; displayName: string; role: 'owner' | 'member' };
  members: Array<{ id: string; displayName: string; role: 'owner' | 'member' }>;
  chores: Array<{
    id: string;
    title: string;
    dueAt: string;
    completedAt: string | null;
    assignedTo: string | null;
    version: number;
  }>;
  groceries: Array<{
    id: string;
    name: string;
    quantity: string;
    note: string;
    checked: boolean;
    version: number;
  }>;
  pets: Array<{
    id: string;
    name: string;
    species: string;
    routines: Array<{
      id: string;
      kind: 'feeding' | 'walk' | 'medication-note';
      label: string;
      schedule: string;
      lastCompletedAt: string | null;
      handoff: string;
      version: number;
    }>;
  }>;
};

type ErrorPayload = { error?: string; message?: string; currentVersion?: number };

function errorPayload(value: unknown): ErrorPayload {
  if (!value || typeof value !== 'object') return {};
  const candidate = value as Record<string, unknown>;
  return {
    ...(typeof candidate.error === 'string' ? { error: candidate.error } : {}),
    ...(typeof candidate.message === 'string' ? { message: candidate.message } : {}),
    ...(typeof candidate.currentVersion === 'number'
      ? { currentVersion: candidate.currentVersion }
      : {}),
  };
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly payload: ErrorPayload,
  ) {
    super(payload.message ?? 'The request could not be completed.');
  }
}

export class AccountApi {
  private csrfToken = '';

  async setup(input: {
    householdName: string;
    displayName: string;
    email: string;
    password: string;
  }): Promise<Workspace> {
    const auth = await this.request<{ csrfToken: string }>('/api/setup', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    this.csrfToken = auth.csrfToken;
    return this.workspace();
  }

  async login(input: { email: string; password: string }): Promise<Workspace> {
    const auth = await this.request<{ csrfToken: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    this.csrfToken = auth.csrfToken;
    return this.workspace();
  }

  workspace(): Promise<Workspace> {
    return this.request('/api/workspace');
  }

  async write<T>(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown, key?: string) {
    return this.request<T>(path, {
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: {
        'x-csrf-token': this.csrfToken,
        ...(key ? { 'idempotency-key': key } : {}),
      },
    });
  }

  async logout(): Promise<void> {
    await this.write('/api/auth/logout', 'POST');
    this.csrfToken = '';
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(path, {
      ...init,
      credentials: 'same-origin',
      headers: {
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...init.headers,
      },
    });
    const payload: unknown = response.status === 204 ? undefined : await response.json();
    if (!response.ok) throw new ApiError(response.status, errorPayload(payload));
    return payload as T;
  }
}
