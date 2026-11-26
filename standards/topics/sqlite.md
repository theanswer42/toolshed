# Topic: SQLite

Rules for projects that store data in SQLite. They apply in addition to `core.md`. The stack document gives the connection helper and the transaction helper for its language.

SQL written in the open is reviewable, and the schema is where invariants are enforced. An ORM hides both.

**Connections.** One helper opens every connection and turns on `foreign_keys`, `journal_mode = WAL`, and a `busy_timeout`. SQLite leaves foreign key enforcement off unless each connection turns it on. No code opens a connection any other way.

**Schema.**

- Tables are declared `STRICT`. Columns are NOT NULL unless absence has a meaning.
- Enum columns carry a CHECK listing the allowed values. Ranges and cross-column rules carry a CHECK.
- Booleans are INTEGER with `CHECK (col IN (0, 1))`. Timestamps are ISO 8601 UTC text. Money is INTEGER minor units.
- Every relationship has a foreign key with an explicit ON DELETE action.

**Repositories.**

- One module per aggregate. Functions take a connection and return domain types, never rows or dictionaries.
- SQL statements are module-level constants so a reviewer can scan them in one place.
- Values are always bound as parameters. No string formatting or concatenation builds SQL.
- Column lists are explicit. No `SELECT *`.
- One mapping function per type converts a row to a domain value.
- SQL may filter, join, order, and page. A query that computes a business result, such as a balance, belongs to the tier of that result and has a property.
- Repositories never commit or roll back.


**Transactions.** The service layer owns them, one per use case. The transaction helper issues `BEGIN IMMEDIATE`, then `COMMIT` on success or `ROLLBACK` on error.

**Migrations.** Migrations are T1. They are numbered SQL files applied in order when the app starts. An applied migration is never edited. A fix is a new migration.

Before applying any pending migration, the migration step snapshots the database with `VACUUM INTO` to `/data/backups/<timestamp>-pre-<version>.db`. If the snapshot fails, startup fails and nothing is migrated. The five most recent snapshots are kept. Rolling back means running the previous image against its pre-migration snapshot, since migrations only go forward. A test applies every migration to a database built from the previous release's schema and checks that the snapshot exists and opens.

**Tests.**

- **Repositories.** Test against a real SQLite database built from the real migrations. Never mock the database. Each type has a save-then-load round-trip test.
- **Schema constraints.** Each invariant enforced in the schema has a test that tries to break it with raw SQL and expects the constraint error.
