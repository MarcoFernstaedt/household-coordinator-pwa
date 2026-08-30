#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const sql = readFileSync(new URL('../migrations/001_initial.sql', import.meta.url), 'utf8');
const db = new DatabaseSync(':memory:');
try {
  db.exec(sql);
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all()
    .map((row) => row.name);
  const expected = [
    'chores',
    'groceries',
    'guest_grants',
    'households',
    'idempotency',
    'pet_routines',
    'pets',
    'sessions',
    'users',
  ];
  if (JSON.stringify(tables) !== JSON.stringify(expected))
    throw new Error(`Unexpected migration tables: ${tables.join(',')}`);
  const foreignKeys = db.prepare('PRAGMA foreign_key_check').all();
  if (foreignKeys.length) throw new Error('Foreign-key validation failed.');
  console.log(`migration_check tables=${tables.length} foreign_key_findings=0`);
} finally {
  db.close();
}
