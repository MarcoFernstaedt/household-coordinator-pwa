import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { hash, verify } from 'argon2';
import { z } from 'zod';

const setupSchema = z.object({
  householdName: z.string().trim().min(1).max(80),
  displayName: z.string().trim().min(1).max(80),
  email: z
    .string()
    .email()
    .max(254)
    .transform((value) => value.toLowerCase()),
  password: z.string().min(14).max(128),
});
const choreSchema = z.object({
  title: z.string().trim().min(1).max(120),
  dueAt: z.string().datetime(),
  assignedTo: z.string().uuid().optional(),
});
const memberSchema = setupSchema.omit({ householdName: true });

interface Session {
  id: string;
  userId: string;
  householdId: string;
  role: 'owner' | 'member';
  csrfToken: string;
}

interface BuildOptions {
  databasePath: string;
  allowedOrigins: string[];
  now?: () => Date;
}

function token(): string {
  return randomBytes(32).toString('base64url');
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function migrate(db: DatabaseSync): void {
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS households (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
      display_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('owner','member')),
      created_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS sessions (
      id_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      csrf_token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS chores (
      id TEXT PRIMARY KEY,
      household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      due_at TEXT NOT NULL,
      completed_at TEXT,
      assigned_to TEXT REFERENCES users(id),
      version INTEGER NOT NULL DEFAULT 1,
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS idx_chores_household ON chores(household_id);
    CREATE TABLE IF NOT EXISTS groceries (
      id TEXT PRIMARY KEY,
      household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      quantity TEXT NOT NULL,
      note TEXT NOT NULL,
      checked INTEGER NOT NULL DEFAULT 0 CHECK(checked IN (0,1)),
      version INTEGER NOT NULL DEFAULT 1,
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS idx_groceries_household ON groceries(household_id);
    CREATE TABLE IF NOT EXISTS pets (
      id TEXT PRIMARY KEY,
      household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      species TEXT NOT NULL,
      created_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS pet_routines (
      id TEXT PRIMARY KEY,
      pet_id TEXT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
      household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK(kind IN ('feeding','walk','medication-note')),
      label TEXT NOT NULL,
      schedule TEXT NOT NULL,
      last_completed_at TEXT,
      handoff TEXT NOT NULL DEFAULT '',
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS guest_grants (
      id TEXT PRIMARY KEY,
      household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      purpose TEXT NOT NULL,
      actions_json TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS idempotency (
      household_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      key TEXT NOT NULL,
      response_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (household_id, user_id, key)
    ) STRICT;
  `);
}

function parseSession(request: FastifyRequest, db: DatabaseSync): Session | null {
  const raw = request.cookies.household_session;
  if (!raw) return null;
  const row = db
    .prepare(
      `SELECT s.id_hash, s.csrf_token_hash, s.expires_at, u.id AS user_id,
      u.household_id, u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id_hash=?`,
    )
    .get(digest(raw)) as Record<string, unknown> | undefined;
  if (!row) return null;
  if (String(row.expires_at) <= new Date().toISOString()) {
    db.prepare('DELETE FROM sessions WHERE id_hash=?').run(String(row.id_hash));
    return null;
  }
  return {
    id: String(row.id_hash),
    userId: String(row.user_id),
    householdId: String(row.household_id),
    role: String(row.role) as 'owner' | 'member',
    csrfToken: String(row.csrf_token_hash),
  };
}

function requireSession(request: FastifyRequest, db: DatabaseSync): Session {
  const session = parseSession(request, db);
  if (!session)
    throw Object.assign(new Error('Authentication required.'), {
      statusCode: 401,
      code: 'unauthorized',
    });
  return session;
}

function requireWrite(request: FastifyRequest, db: DatabaseSync, origins: Set<string>): Session {
  const session = requireSession(request, db);
  const origin = request.headers.origin;
  if (!origin || !origins.has(origin)) {
    throw Object.assign(new Error('Write origin is not allowed.'), {
      statusCode: 403,
      code: 'forbidden',
    });
  }
  const supplied = request.headers['x-csrf-token'];
  if (typeof supplied !== 'string' || digest(supplied) !== session.csrfToken) {
    throw Object.assign(new Error('CSRF validation failed.'), {
      statusCode: 403,
      code: 'forbidden',
    });
  }
  return session;
}

async function issueSession(app: FastifyInstance, db: DatabaseSync, userId: string) {
  const sessionToken = token();
  const csrfToken = token();
  db.prepare(
    'INSERT INTO sessions(id_hash,user_id,csrf_token_hash,expires_at) VALUES(?,?,?,?)',
  ).run(
    digest(sessionToken),
    userId,
    digest(csrfToken),
    new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
  );
  return { sessionToken, csrfToken };
}

export async function buildApp(options: BuildOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, bodyLimit: 32 * 1024 });
  const db = new DatabaseSync(options.databasePath);
  migrate(db);
  const origins = new Set(options.allowedOrigins);
  const now = options.now ?? (() => new Date());
  await app.register(cookie);
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });

  app.addHook('onSend', (_request, reply, _payload, done) => {
    reply.headers({
      'content-security-policy':
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
      'cross-origin-opener-policy': 'same-origin',
    });
    done();
  });

  app.get('/api/health', async () => ({ status: 'ok' }));

  app.get('/api/workspace', async (request) => {
    const session = requireSession(request, db);
    const household = db
      .prepare('SELECT name FROM households WHERE id=?')
      .get(session.householdId) as { name: string };
    const user = db
      .prepare('SELECT display_name FROM users WHERE id=? AND household_id=?')
      .get(session.userId, session.householdId) as { display_name: string };
    const members = db
      .prepare('SELECT id,display_name,role FROM users WHERE household_id=? ORDER BY display_name')
      .all(session.householdId) as Record<string, unknown>[];
    const chores = db
      .prepare(
        'SELECT id,title,due_at,completed_at,assigned_to,version FROM chores WHERE household_id=? ORDER BY due_at,title',
      )
      .all(session.householdId) as Record<string, unknown>[];
    const groceries = db
      .prepare(
        'SELECT id,name,quantity,note,checked,version FROM groceries WHERE household_id=? ORDER BY checked,name',
      )
      .all(session.householdId) as Record<string, unknown>[];
    const pets = db
      .prepare('SELECT id,name,species FROM pets WHERE household_id=? ORDER BY name')
      .all(session.householdId) as Record<string, unknown>[];
    const routines = db
      .prepare(
        'SELECT id,pet_id,kind,label,schedule,last_completed_at,handoff,version FROM pet_routines WHERE household_id=? ORDER BY schedule,label',
      )
      .all(session.householdId) as Record<string, unknown>[];
    return {
      household: { id: session.householdId, name: household.name },
      user: { id: session.userId, displayName: user.display_name, role: session.role },
      members: members.map((member) => ({
        id: member.id,
        displayName: member.display_name,
        role: member.role,
      })),
      chores: chores.map((row) => ({
        id: row.id,
        title: row.title,
        dueAt: row.due_at,
        completedAt: row.completed_at,
        assignedTo: row.assigned_to,
        version: row.version,
      })),
      groceries: groceries.map((row) => ({
        id: row.id,
        name: row.name,
        quantity: row.quantity,
        note: row.note,
        checked: Boolean(row.checked),
        version: row.version,
      })),
      pets: pets.map((pet) => ({
        id: pet.id,
        name: pet.name,
        species: pet.species,
        routines: routines
          .filter((routine) => routine.pet_id === pet.id)
          .map((routine) => ({
            id: routine.id,
            kind: routine.kind,
            label: routine.label,
            schedule: routine.schedule,
            lastCompletedAt: routine.last_completed_at,
            handoff: routine.handoff,
            version: routine.version,
          })),
      })),
    };
  });

  app.setErrorHandler((error, _request, reply) => {
    const candidate = error as Error & { statusCode?: number; code?: string; validation?: unknown };
    const status =
      candidate.name === 'ZodError'
        ? 400
        : candidate.statusCode && candidate.statusCode >= 400
          ? candidate.statusCode
          : 500;
    const code = status === 500 ? 'internal_error' : (candidate.code ?? 'invalid_request');
    const message = status === 500 ? 'The request could not be completed.' : candidate.message;
    void reply.status(status).send({ error: code, message });
  });

  app.post('/api/setup', async (request, reply) => {
    const body = setupSchema.parse(request.body);
    const origin = request.headers.origin;
    if (!origin || !origins.has(origin))
      return reply
        .status(403)
        .send({ error: 'forbidden', message: 'Write origin is not allowed.' });
    const now = new Date().toISOString();
    const householdId = randomUUID();
    const userId = randomUUID();
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('INSERT INTO households(id,name,created_at) VALUES(?,?,?)').run(
        householdId,
        body.householdName,
        now,
      );
      db.prepare(
        'INSERT INTO users(id,household_id,display_name,email,password_hash,role,created_at) VALUES(?,?,?,?,?,?,?)',
      ).run(
        userId,
        householdId,
        body.displayName,
        body.email,
        await hash(body.password),
        'owner',
        now,
      );
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    const issued = await issueSession(app, db, userId);
    reply.setCookie('household_session', issued.sessionToken, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 8 * 60 * 60,
    });
    return reply.status(201).send({ csrfToken: issued.csrfToken, role: 'owner', householdId });
  });

  app.post(
    '/api/auth/login',
    { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } },
    async (request, reply) => {
      const origin = request.headers.origin;
      if (!origin || !origins.has(origin))
        return reply
          .status(403)
          .send({ error: 'forbidden', message: 'Login origin is not allowed.' });
      const body = z
        .object({ email: z.string().email(), password: z.string().max(128) })
        .parse(request.body);
      const row = db
        .prepare('SELECT id,password_hash FROM users WHERE email=? COLLATE NOCASE')
        .get(body.email) as Record<string, unknown> | undefined;
      if (!row || !(await verify(String(row.password_hash), body.password))) {
        return reply
          .status(401)
          .send({ error: 'invalid_credentials', message: 'Email or password is incorrect.' });
      }
      const issued = await issueSession(app, db, String(row.id));
      reply.setCookie('household_session', issued.sessionToken, {
        httpOnly: true,
        sameSite: 'strict',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 8 * 60 * 60,
      });
      return { csrfToken: issued.csrfToken };
    },
  );

  app.post('/api/auth/logout', async (request, reply) => {
    const session = requireWrite(request, db, origins);
    db.prepare('DELETE FROM sessions WHERE id_hash=?').run(session.id);
    reply.clearCookie('household_session', { path: '/' });
    return reply.status(204).send();
  });

  app.post('/api/members', async (request, reply) => {
    const session = requireWrite(request, db, origins);
    if (session.role !== 'owner')
      return reply.status(403).send({ error: 'forbidden', message: 'Owner access is required.' });
    const body = memberSchema.parse(request.body);
    const id = randomUUID();
    db.prepare(
      'INSERT INTO users(id,household_id,display_name,email,password_hash,role,created_at) VALUES(?,?,?,?,?,?,?)',
    ).run(
      id,
      session.householdId,
      body.displayName,
      body.email,
      await hash(body.password),
      'member',
      new Date().toISOString(),
    );
    return reply.status(201).send({ id, displayName: body.displayName, role: 'member' });
  });

  app.post('/api/chores', async (request, reply) => {
    const session = requireWrite(request, db, origins);
    const key = request.headers['idempotency-key'];
    if (typeof key !== 'string' || !z.string().uuid().safeParse(key).success) {
      return reply
        .status(400)
        .send({ error: 'invalid_idempotency_key', message: 'A UUID idempotency key is required.' });
    }
    const existing = db
      .prepare('SELECT response_json FROM idempotency WHERE household_id=? AND user_id=? AND key=?')
      .get(session.householdId, session.userId, key) as { response_json: string } | undefined;
    if (existing) return reply.status(200).send(JSON.parse(existing.response_json));
    const body = choreSchema.parse(request.body);
    if (body.assignedTo) {
      const assignee = db
        .prepare('SELECT 1 FROM users WHERE id=? AND household_id=?')
        .get(body.assignedTo, session.householdId);
      if (!assignee)
        return reply
          .status(400)
          .send({ error: 'invalid_assignee', message: 'Assignee must belong to this household.' });
    }
    const chore = {
      id: randomUUID(),
      title: body.title,
      dueAt: body.dueAt,
      assignedTo: body.assignedTo ?? null,
      completedAt: null,
      status: 'open',
      version: 1,
    };
    const now = new Date().toISOString();
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(
        'INSERT INTO chores(id,household_id,title,due_at,assigned_to,created_by,created_at) VALUES(?,?,?,?,?,?,?)',
      ).run(
        chore.id,
        session.householdId,
        body.title,
        body.dueAt,
        body.assignedTo ?? null,
        session.userId,
        now,
      );
      db.prepare(
        'INSERT INTO idempotency(household_id,user_id,key,response_json,created_at) VALUES(?,?,?,?,?)',
      ).run(session.householdId, session.userId, key, JSON.stringify(chore), now);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    return reply.status(201).send(chore);
  });

  app.get('/api/chores/:id', async (request, reply) => {
    const session = requireSession(request, db);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const row = db
      .prepare(
        'SELECT id,title,due_at,completed_at,version FROM chores WHERE id=? AND household_id=?',
      )
      .get(id, session.householdId) as Record<string, unknown> | undefined;
    if (!row) return reply.status(404).send({ error: 'not_found', message: 'Record not found.' });
    return {
      id: row.id,
      title: row.title,
      dueAt: row.due_at,
      completedAt: row.completed_at,
      version: row.version,
    };
  });

  app.patch('/api/chores/:id', async (request, reply) => {
    const session = requireWrite(request, db, origins);
    const key = z.string().uuid().parse(request.headers['idempotency-key']);
    const replay = db
      .prepare('SELECT response_json FROM idempotency WHERE household_id=? AND user_id=? AND key=?')
      .get(session.householdId, session.userId, key) as { response_json: string } | undefined;
    if (replay) return reply.status(200).send(JSON.parse(replay.response_json));
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z
      .object({
        action: z.enum(['complete', 'reopen']),
        expectedVersion: z.number().int().positive(),
      })
      .parse(request.body);
    const row = db
      .prepare(
        'SELECT id,assigned_to,completed_at,version FROM chores WHERE id=? AND household_id=?',
      )
      .get(id, session.householdId) as Record<string, unknown> | undefined;
    if (!row) return reply.status(404).send({ error: 'not_found', message: 'Record not found.' });
    if (session.role !== 'owner' && row.assigned_to !== session.userId)
      return reply
        .status(403)
        .send({ error: 'forbidden', message: 'This chore is assigned to another member.' });
    if (Number(row.version) !== body.expectedVersion)
      return reply.status(409).send({
        error: 'version_conflict',
        message: 'This chore changed on another device.',
        currentVersion: Number(row.version),
      });
    const completedAt = body.action === 'complete' ? new Date().toISOString() : null;
    const response = {
      id,
      status: completedAt ? 'completed' : 'open',
      completedAt,
      version: body.expectedVersion + 1,
    };
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(
        'UPDATE chores SET completed_at=?,version=version+1 WHERE id=? AND household_id=? AND version=?',
      ).run(completedAt, id, session.householdId, body.expectedVersion);
      db.prepare(
        'INSERT INTO idempotency(household_id,user_id,key,response_json,created_at) VALUES(?,?,?,?,?)',
      ).run(
        session.householdId,
        session.userId,
        key,
        JSON.stringify(response),
        new Date().toISOString(),
      );
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    return response;
  });

  app.post('/api/groceries', async (request, reply) => {
    const session = requireWrite(request, db, origins);
    const key = z.string().uuid().parse(request.headers['idempotency-key']);
    const existing = db
      .prepare('SELECT response_json FROM idempotency WHERE household_id=? AND user_id=? AND key=?')
      .get(session.householdId, session.userId, key) as { response_json: string } | undefined;
    if (existing) return reply.status(200).send(JSON.parse(existing.response_json));
    const body = z
      .object({
        name: z.string().trim().min(1).max(100),
        quantity: z.string().trim().min(1).max(40),
        note: z.string().trim().max(160).default(''),
      })
      .parse(request.body);
    const item = { id: randomUUID(), ...body, checked: false, version: 1 };
    const now = new Date().toISOString();
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(
        'INSERT INTO groceries(id,household_id,name,quantity,note,created_by,created_at) VALUES(?,?,?,?,?,?,?)',
      ).run(item.id, session.householdId, item.name, item.quantity, item.note, session.userId, now);
      db.prepare(
        'INSERT INTO idempotency(household_id,user_id,key,response_json,created_at) VALUES(?,?,?,?,?)',
      ).run(session.householdId, session.userId, key, JSON.stringify(item), now);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    return reply.status(201).send(item);
  });

  app.get('/api/groceries', async (request) => {
    const session = requireSession(request, db);
    const rows = db
      .prepare(
        'SELECT id,name,quantity,note,checked,version FROM groceries WHERE household_id=? ORDER BY checked,name',
      )
      .all(session.householdId) as Record<string, unknown>[];
    return {
      items: rows.map((row) => ({
        id: row.id,
        name: row.name,
        quantity: row.quantity,
        note: row.note,
        checked: Boolean(row.checked),
        version: row.version,
      })),
    };
  });

  app.patch('/api/groceries/:id', async (request, reply) => {
    const session = requireWrite(request, db, origins);
    const key = z.string().uuid().parse(request.headers['idempotency-key']);
    const replay = db
      .prepare('SELECT response_json FROM idempotency WHERE household_id=? AND user_id=? AND key=?')
      .get(session.householdId, session.userId, key) as { response_json: string } | undefined;
    if (replay) return reply.status(200).send(JSON.parse(replay.response_json));
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z
      .object({ checked: z.boolean(), expectedVersion: z.number().int().positive() })
      .parse(request.body);
    const row = db
      .prepare('SELECT version FROM groceries WHERE id=? AND household_id=?')
      .get(id, session.householdId) as { version: number } | undefined;
    if (!row) return reply.status(404).send({ error: 'not_found', message: 'Record not found.' });
    if (row.version !== body.expectedVersion)
      return reply.status(409).send({
        error: 'version_conflict',
        message: 'This grocery item changed on another device.',
        currentVersion: row.version,
      });
    const response = { id, checked: body.checked, version: body.expectedVersion + 1 };
    const createdAt = now().toISOString();
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(
        'UPDATE groceries SET checked=?,version=version+1 WHERE id=? AND household_id=? AND version=?',
      ).run(body.checked ? 1 : 0, id, session.householdId, body.expectedVersion);
      db.prepare(
        'INSERT INTO idempotency(household_id,user_id,key,response_json,created_at) VALUES(?,?,?,?,?)',
      ).run(session.householdId, session.userId, key, JSON.stringify(response), createdAt);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    return response;
  });

  app.delete('/api/groceries/completed', async (request) => {
    const session = requireWrite(request, db, origins);
    const key = z.string().uuid().parse(request.headers['idempotency-key']);
    const replay = db
      .prepare('SELECT response_json FROM idempotency WHERE household_id=? AND user_id=? AND key=?')
      .get(session.householdId, session.userId, key) as { response_json: string } | undefined;
    if (replay) return JSON.parse(replay.response_json);
    const createdAt = now().toISOString();
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = db
        .prepare('DELETE FROM groceries WHERE household_id=? AND checked=1')
        .run(session.householdId);
      const response = { cleared: Number(result.changes) };
      db.prepare(
        'INSERT INTO idempotency(household_id,user_id,key,response_json,created_at) VALUES(?,?,?,?,?)',
      ).run(session.householdId, session.userId, key, JSON.stringify(response), createdAt);
      db.exec('COMMIT');
      return response;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  });

  app.post('/api/pets', async (request, reply) => {
    const session = requireWrite(request, db, origins);
    const key = z.string().uuid().parse(request.headers['idempotency-key']);
    const replay = db
      .prepare('SELECT response_json FROM idempotency WHERE household_id=? AND user_id=? AND key=?')
      .get(session.householdId, session.userId, key) as { response_json: string } | undefined;
    if (replay) return reply.status(200).send(JSON.parse(replay.response_json));
    const body = z
      .object({ name: z.string().trim().min(1).max(80), species: z.string().trim().min(1).max(40) })
      .parse(request.body);
    const pet = { id: randomUUID(), ...body };
    const createdAt = now().toISOString();
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('INSERT INTO pets(id,household_id,name,species,created_at) VALUES(?,?,?,?,?)').run(
        pet.id,
        session.householdId,
        pet.name,
        pet.species,
        createdAt,
      );
      db.prepare(
        'INSERT INTO idempotency(household_id,user_id,key,response_json,created_at) VALUES(?,?,?,?,?)',
      ).run(session.householdId, session.userId, key, JSON.stringify(pet), createdAt);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    return reply.status(201).send(pet);
  });

  app.post('/api/pets/:petId/routines', async (request, reply) => {
    const session = requireWrite(request, db, origins);
    const key = z.string().uuid().parse(request.headers['idempotency-key']);
    const replay = db
      .prepare('SELECT response_json FROM idempotency WHERE household_id=? AND user_id=? AND key=?')
      .get(session.householdId, session.userId, key) as { response_json: string } | undefined;
    if (replay) return reply.status(200).send(JSON.parse(replay.response_json));
    const { petId } = z.object({ petId: z.string().uuid() }).parse(request.params);
    const pet = db
      .prepare('SELECT 1 FROM pets WHERE id=? AND household_id=?')
      .get(petId, session.householdId);
    if (!pet) return reply.status(404).send({ error: 'not_found', message: 'Record not found.' });
    const body = z
      .object({
        kind: z.enum(['feeding', 'walk', 'medication-note']),
        label: z.string().trim().min(1).max(120),
        schedule: z.string().trim().min(1).max(80),
      })
      .parse(request.body);
    const routine = {
      id: randomUUID(),
      ...body,
      version: 1,
      disclaimer: 'Routine record only — not medical advice.',
    };
    const createdAt = now().toISOString();
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(
        'INSERT INTO pet_routines(id,pet_id,household_id,kind,label,schedule,created_at) VALUES(?,?,?,?,?,?,?)',
      ).run(
        routine.id,
        petId,
        session.householdId,
        routine.kind,
        routine.label,
        routine.schedule,
        createdAt,
      );
      db.prepare(
        'INSERT INTO idempotency(household_id,user_id,key,response_json,created_at) VALUES(?,?,?,?,?)',
      ).run(session.householdId, session.userId, key, JSON.stringify(routine), createdAt);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    return reply.status(201).send(routine);
  });

  app.post('/api/pet-routines/:id/completions', async (request, reply) => {
    const session = requireWrite(request, db, origins);
    const key = z.string().uuid().parse(request.headers['idempotency-key']);
    const replay = db
      .prepare('SELECT response_json FROM idempotency WHERE household_id=? AND user_id=? AND key=?')
      .get(session.householdId, session.userId, key) as { response_json: string } | undefined;
    if (replay) return reply.status(200).send(JSON.parse(replay.response_json));
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z
      .object({ expectedVersion: z.number().int().positive(), handoff: z.string().trim().max(240) })
      .parse(request.body);
    const row = db
      .prepare('SELECT version FROM pet_routines WHERE id=? AND household_id=?')
      .get(id, session.householdId) as { version: number } | undefined;
    if (!row) return reply.status(404).send({ error: 'not_found', message: 'Record not found.' });
    if (row.version !== body.expectedVersion)
      return reply.status(409).send({
        error: 'version_conflict',
        message: 'This routine changed on another device.',
        currentVersion: row.version,
      });
    const completedAt = now().toISOString();
    const response = {
      id,
      completedAt,
      handoff: body.handoff,
      handoffStatus: body.handoff ? 'ready' : 'complete',
      version: body.expectedVersion + 1,
    };
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(
        'UPDATE pet_routines SET last_completed_at=?,handoff=?,version=version+1 WHERE id=? AND household_id=? AND version=?',
      ).run(completedAt, body.handoff, id, session.householdId, body.expectedVersion);
      db.prepare(
        'INSERT INTO idempotency(household_id,user_id,key,response_json,created_at) VALUES(?,?,?,?,?)',
      ).run(session.householdId, session.userId, key, JSON.stringify(response), completedAt);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    return response;
  });

  app.post('/api/guests', async (request, reply) => {
    const session = requireWrite(request, db, origins);
    if (session.role !== 'owner')
      return reply.status(403).send({ error: 'forbidden', message: 'Owner access is required.' });
    const body = z
      .object({
        purpose: z.string().trim().min(1).max(120),
        actions: z
          .array(z.enum(['chores:read', 'groceries:read', 'groceries:check', 'pet-care:read']))
          .min(1)
          .max(4),
        expiresAt: z.string().datetime({ offset: true }),
      })
      .parse(request.body);
    const expiresAt = new Date(body.expiresAt).toISOString();
    if (Date.parse(expiresAt) <= now().getTime())
      return reply
        .status(400)
        .send({ error: 'invalid_expiry', message: 'Guest expiry must be in the future.' });
    const opaqueToken = token();
    const id = randomUUID();
    db.prepare(
      'INSERT INTO guest_grants(id,household_id,token_hash,purpose,actions_json,expires_at,created_by,created_at) VALUES(?,?,?,?,?,?,?,?)',
    ).run(
      id,
      session.householdId,
      digest(opaqueToken),
      body.purpose,
      JSON.stringify([...new Set(body.actions)].sort()),
      expiresAt,
      session.userId,
      now().toISOString(),
    );
    return reply.status(201).send({
      id,
      token: opaqueToken,
      purpose: body.purpose,
      actions: body.actions,
      expiresAt,
    });
  });

  app.delete('/api/guests/:id', async (request, reply) => {
    const session = requireWrite(request, db, origins);
    if (session.role !== 'owner')
      return reply.status(403).send({ error: 'forbidden', message: 'Owner access is required.' });
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    db.prepare(
      'UPDATE guest_grants SET revoked_at=? WHERE id=? AND household_id=? AND revoked_at IS NULL',
    ).run(now().toISOString(), id, session.householdId);
    return reply.status(204).send();
  });

  function guestGrant(request: FastifyRequest, action: string): { householdId: string } {
    const authorization = request.headers.authorization;
    const opaqueToken = authorization?.startsWith('Guest ') ? authorization.slice(6) : '';
    const row = opaqueToken
      ? (db
          .prepare(
            'SELECT household_id,actions_json,expires_at,revoked_at FROM guest_grants WHERE token_hash=?',
          )
          .get(digest(opaqueToken)) as Record<string, unknown> | undefined)
      : undefined;
    if (!row || row.revoked_at || String(row.expires_at) <= now().toISOString()) {
      throw Object.assign(new Error('Guest access is unavailable.'), {
        statusCode: 401,
        code: 'grant_unavailable',
      });
    }
    const actions = JSON.parse(String(row.actions_json)) as string[];
    if (!actions.includes(action))
      throw Object.assign(new Error('This guest grant does not allow that action.'), {
        statusCode: 403,
        code: 'forbidden',
      });
    return { householdId: String(row.household_id) };
  }

  app.get('/api/guest/groceries', async (request) => {
    const grant = guestGrant(request, 'groceries:read');
    const rows = db
      .prepare(
        'SELECT id,name,quantity,note,checked,version FROM groceries WHERE household_id=? ORDER BY checked,name',
      )
      .all(grant.householdId) as Record<string, unknown>[];
    return {
      items: rows.map((row) => ({
        id: row.id,
        name: row.name,
        quantity: row.quantity,
        note: row.note,
        checked: Boolean(row.checked),
        version: row.version,
      })),
    };
  });

  app.post('/api/guest/groceries', async (request, reply) => {
    guestGrant(request, 'groceries:create');
    return reply.status(501).send({ error: 'not_implemented', message: 'Action is unavailable.' });
  });

  app.addHook('onClose', () => db.close());
  return app;
}
