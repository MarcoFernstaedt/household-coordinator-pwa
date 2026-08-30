# Database migrations

`migrations/001_initial.sql` is the reviewable additive bootstrap migration. The application initializes the same schema on startup with foreign keys enabled, and `npm run migration:check` executes the SQL file independently against a disposable SQLite database. Every table uses STRICT mode, realm-bearing records carry `household_id`, public IDs are UUIDs, roles/scopes use closed checks or validated JSON, and realm lookup columns are indexed.

## Disposable verification

Every API test opens `:memory:` and therefore applies the migration from an empty database before exercising constraints and transactions. Runtime smoke uses a new temporary filesystem database and deletes it afterward.

## Forward migration rules

1. Create a numbered additive SQL file; never edit an already released migration.
2. Write a failing migration/compatibility test before production code.
3. Use transactions where SQLite permits and preserve existing data.
4. Add constraints/indexes with measured compatibility and a documented rollback/compensation path.
5. Test empty install, upgrade from the preceding schema, application startup, governing API suite, and backup restoration on disposable state.
6. Never run a destructive production migration without exact operator approval and a verified backup.

## Rollback

The MVP has no automated destructive down migration. Before a future migration, stop writes, copy the database using SQLite's backup API, apply and verify the migration, and retain the prior application artifact. On failure, stop the candidate, restore the verified backup atomically, and restart the prior artifact. Do not partially reverse DDL by hand.
