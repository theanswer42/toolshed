# Trusting agent-written code: a spec for coding and reviewing agents

Nov 13, 2026 · @Sagar Gokhale

## Purpose and terms

This spec tells coding and reviewing agents how to build software so that a human can trust it without reading every line. The human reviews one small artifact per project, the project spec, and deterministic checks tie the code to it.

The spec has three parts. Part 1 gives principles that apply in any language. Part 2 gives the concrete Python defaults. Part 3 describes how to start a new project by writing its project spec.

**Order of authority.** The user's direct instruction comes first, then the project spec, then this document, then agent judgment. If a rule here cannot be met, stop and ask. Do not quietly weaken the rule.

| Term | Meaning |
| --- | --- |
| Project spec | `PROJECT_SPEC.md` at the repo root. Lists the project's entities, invariants, risk tiers, and deviations from this spec. |
| Invariant | A plain-language statement that must always hold, with a stable ID such as `INV-3`. |
| Core | Pure domain logic. No I/O, clock, randomness, environment, or global state. |
| Shell | Everything else: HTTP handlers, repositories, CLI entry points, schedulers, external clients. |
| Property | An executable test that asserts an invariant over generated inputs. |
| Reference model | A deliberately simple implementation used as an oracle for the real one. |
| Risk tier | T1, T2, or T3. Sets how much verification and human review a piece of code gets. See principle 9. |
| Change report | The structured summary a coding agent writes at the end of every change. See principle 13. |

### Where each kind of instruction lives

Four files guide the work, and each has one job. Keeping them apart stops domain rules from landing in a file agents rewrite freely.

| File | Holds | Who changes it |
| --- | --- | --- |
| This spec | How to build and verify, across all projects | The user |
| `PROJECT_SPEC.md` | What this app must do: entities, invariants, tiers, deviations | Agents propose, the user approves |
| `README.md` | How the program is shaped and why: overview, components, key decisions | Agents, with every change that alters the shape |
| `CLAUDE.md` | How to work in this repo: pointers and operational notes | Agents, freely |

`CLAUDE.md` stays thin. It contains:

- Links to this spec and to `PROJECT_SPEC.md`, with the instruction to read both before coding.
- The commands to run the app, the checks, and mutation testing.
- Operational notes for this repo: required environment variables, local setup, known quirks.
- Where tasks are tracked, and the scratchpad naming convention.
- A reminder that every change ends with the change report.

`CLAUDE.md` never contains invariants, tiers, or domain rules, and it does not restate either spec. If an agent learns something that amounts to a domain rule, it proposes a project spec change instead of noting it in `CLAUDE.md`.

## Part 1: Principles

Each principle has a rule, the reason for it, and what a reviewing agent checks. When a case is not covered, apply the reason.

### 1. The project spec is the source of truth

**Rule.** Behavior derives from the invariants in `PROJECT_SPEC.md`. Agents may propose additions, changes, or removals, but never apply them without the user's explicit approval.

**Why.** It is the one artifact the user reads in full. If agents can edit it freely, nothing anchors the code.

**Check.** Any diff to `PROJECT_SPEC.md` has a recorded approval in the change report. Every T1 or T2 behavior change maps to an invariant ID.

### 2. Functional core, imperative shell

**Rule.** Domain decisions live in pure functions. The shell gathers inputs, calls the core, and persists or returns the result. The core receives time, random values, and generated IDs as arguments. Core functions do not mutate their arguments, write logs, or keep module-level caches.

**Why.** Pure code can be tested with generated inputs and no mocks. It also concentrates the logic worth reviewing into one place.

**Check.** Import rules pass. The core has no I/O, clock, environment, or random calls, and no argument mutation, logging, or module-level state. Shell functions do not branch on domain rules.

### 3. Make illegal states unrepresentable

**Rule.** Parse raw input into typed domain values at the boundary. The core accepts only those types. Use enums or unions for closed sets, and distinct types for IDs, money, and units.

**Why.** The type checker is a deterministic reviewer that runs on every change.

**Check.** Strict type checking passes on the core. No untyped dictionaries or `Any` in core signatures. Every suppression has a written reason.

### 4. Enforce each invariant at the lowest layer that can

**Rule.** If the database schema can enforce an invariant, it does, in addition to the core. This covers NOT NULL, CHECK, UNIQUE, and foreign keys.

**Why.** A schema constraint holds no matter which code path writes the data, including paths written later.

**Check.** Each invariant in the project spec lists where it is enforced. The schema contains the constraints listed.

### 5. Properties over examples for the core

**Rule.** Every invariant has at least one property-based test that names its invariant ID. Example tests are for regressions and for documenting specific cases.

**Why.** A property is short enough to review and covers inputs nobody thought to write down.

**Check.** Each invariant ID appears in the tests. The property calls the real function, not a mock. Generators reach empty, zero, boundary, and duplicate values.

### 6. Stateful behavior gets a reference model

**Rule.** Where correctness depends on a sequence of operations, write the simplest possible model of the behavior. Run generated operation sequences against both and compare. The model is written for obviousness, not speed.

**Why.** A 50-line model that is plainly right can vouch for a far larger implementation.

**Check.** The model imports nothing from the implementation. It is small enough to read in one sitting.

### 7. Tests are independent of the implementation

**Rule.** Write properties from the project spec, before the implementation or without reading it. Use a separate agent context where the tooling allows. Never weaken, skip, or delete a failing test to make a change pass.

**Why.** Tests written beside the code share its misunderstandings. A failing property means the code is wrong or the invariant is wrong, and the second is the user's decision.

**Check.** Any diff that loosens an assertion, narrows a generator, or adds a skip is flagged and explained in the change report.

### 8. Tests must prove they bite

**Rule.** Run mutation testing on the core. A surviving mutant in T1 code is either killed with a new test or justified in the change report.

**Why.** Passing tests say little unless they fail when the code is wrong. Mutation testing measures that without a human reading the tests.

**Check.** The change report states the mutation score for the code touched and lists surviving mutants.

### 9. Effort follows risk

**Rule.** Every module has a tier, assigned in the project spec. When unsure, use the higher tier. Code that mixes tiers is split.

**Why.** Review attention is limited. Light review is safe only where failure is visible and reversible.

**Check.** Touched modules are classified. The verification matches the tier.

| Tier | What belongs here | Required verification | Human review |
| --- | --- | --- | --- |
| T1 | Failure is silent or irreversible: money, deletion, data integrity, auth, migrations | Invariants, properties, mutation testing with no unexplained survivors, schema constraints | Line by line |
| T2 | Domain logic where failure is visible and recoverable | Invariants, properties, mutation score reported | Shape, plus the change report |
| T3 | Plumbing, UI, glue, formatting | Type checks, lint, a smoke test per entry point | Change report only |

### 10. Mechanical rules live in tools

**Rule.** If a linter, type checker, or CI step can enforce a rule, configure it there. Fast checks run twice: as pre-commit hooks for local feedback, and again in CI, which is authoritative. Never bypass hooks with `--no-verify`, and never disable or loosen a check to make a change pass. A false positive is resolved with an allowlist entry that states its reason. Any change to check configuration, including allowlists and tool versions, is treated as T1.

**Why.** Tool-enforced rules do not depend on an agent remembering them, and they keep this document short.

**Check.** All required checks passed in CI. Any diff to their configuration is flagged, and every new allowlist entry has a reason.

### 11. One way to build

**Rule.** Follow the default stack and layout in Part 2. A deviation needs a reason recorded in the project spec.

**Why.** When every project has the same shape, skimming works because anomalies stand out.

**Check.** Layout and dependencies match the defaults or a recorded deviation. New dependencies are listed in the change report.

### 12. Fail loudly

**Rule.** No swallowed exceptions, no silent defaults for missing data, no fallback path that hides a failure. Errors surface to the caller or the log with enough context to act on.

**Why.** T3 code gets light review only because its failures are visible. Silent failure breaks that bargain.

**Check.** No bare or broad exception handlers without a re-raise or explicit handling. No default values that stand in for missing required data.

### 13. Every change is a pull request with a change report

**Rule.** Each change is delivered as a pull request, one per issue, from its own branch. The change report below is the PR description. It states facts and does not assess its own quality. The coding agent never merges its own PR: the user merges, after the reviewing agent's review.

**Why.** The report tells the user where to look, which is what makes skimming safe. A PR puts the report, the diff, the check results, and the review in one place, and merging stays a human decision.

**Check.** The reviewing agent reruns the checks, confirms each line of the report against the diff, and posts its verdict as a review on the PR.

```markdown
## Change report
- Summary: one or two sentences
- Issue: #N, or "none" during v0
- Tiers touched: T1 / T2 / T3, with module paths
- Invariants affected: IDs, or "none"
- Project spec changes: none, or the change and the user's approval
- Tests: properties added or changed, with invariant IDs
- Loosened tests: none, or each one with the reason
- Checks run: lint, types, imports, tests, mutation (score, survivors)
- New dependencies: none, or name and reason
- Docs: README updated / not needed; interface docs updated / not needed
- Scratchpad: file path, and what was promoted out of it
- Not verified: anything untested, assumed, or stubbed
- Needs human review: the specific files or functions, with the reason
```

### 14. Documentation stays true to the code

**Rule.** Keep four written records, each with one job:

- **README.** The shape of the program: what it does, its main components and how they connect, and how to run it. A Decisions section records each significant choice with the alternatives and the reason. Complex algorithms and state machines are explained there. The README links to invariant IDs and never restates them.
- **Interface docs.** API or CLI references, written only when the project spec lists an external consumer, such as another project or its agents. They are precise and complete, and are either generated from code or checked against it by a test. A change to a documented interface is at least T2, because breaking a consumer is silent from this repo's side.
- **Issues.** After v0, every task starts as an issue stating the problem, the acceptance criteria, and the affected invariant IDs. Commits and the change report reference it.
- **Scratchpad.** `agent-scratchpad/`, committed to git, with one file per task. It records decisions, rejected alternatives, and open questions, not a transcript of reasoning. Agents do not read it unless a task or the user points them to it. Before a task ends, anything durable is promoted: decisions to the README, rules to a project spec proposal, operational notes to `CLAUDE.md`. The scratchpad is never the only record of a decision.

**Why.** Agents trust documentation completely, so docs that drift from the code mislead them. Generated or tested docs cannot drift. The scratchpad keeps the reasoning behind past work available without making it a source of truth.

**Check.** The change report's Docs line matches the diff: a change to components, data flow, or a decision updates the README. Interface doc tests pass. The task's scratchpad file exists, and nothing in it that should have been promoted was left behind.

### 15. Production means the container

**Rule.** A build produces a container image, and running the app with real data means running that image, never running the code on the host. The image meets the container contract in Part 2: configuration from environment variables, secrets from files, state only in one data volume, logs to stdout, a health endpoint, and fixed ports. Each project ships a `compose.yaml` that declares everything the app needs from its environment, including its network tier. Supplying values, storage, and host ports is the runner's job, a separate project outside this spec. Changes to the network tier, container privileges, or secrets are T1.

**Why.** Containers isolate apps from each other and from the host, and the artifact that is tested is the one that runs. Because the app only declares its needs, the runner can change, or move to the cloud, without changing the app.

**Check.** The image builds, and smoke tests pass against the running container. Every setting the app reads is declared in `compose.yaml`. The network tier matches the project spec, and the open tier has a recorded reason.

### Agent roles

**Coding agent.** Read the project spec and the task's issue before writing code. Start the task's scratchpad file. Write or update properties before the implementation for T1 and T2 work. Stop and ask when a task needs an invariant that does not exist. Stop and ask before building anything that runs outside a request, such as a background job, scheduler, polling loop, or long-running worker: this spec does not cover them yet. Before finishing, update the README and interface docs as needed, promote durable scratchpad content, and end with the change report.

**Reviewing agent.** Verify the change against the project spec and this document. Rerun the checks instead of trusting the report. Return pass or fail per principle with evidence. Do not comment on style that the tools already enforce.

The reviewing agent looks first for these: loosened tests, invariants without properties, domain logic in the shell, changed check configuration, and modules placed in too low a tier.

## Part 2: Python specification

These are the defaults for every Python project. A project departs from them only through a deviation recorded in its project spec.

### Default stack

| Concern | Default | Notes |
| --- | --- | --- |
| Packaging | uv | `pyproject.toml`, a committed `uv.lock`, and `.python-version` |
| Lint and format | ruff | Format check runs in CI |
| Types | ty | Exact version pinned. Stricter rules set by hand, see Type checking |
| Tests | pytest with Hypothesis | Properties for the core, real SQLite for repositories, no network |
| Mutation testing | mutmut | Scoped to `core` |
| Import rules | import-linter | Contracts shown below |
| Git hooks | pre-commit | Runs the fast checks before each commit, see Pre-commit and secret scanning |
| Secret scanning | betterleaks | Exact version pinned, with a project-owned `.betterleaks.toml` |
| Dependency audit | pip-audit | Runs in CI |
| Dependency updates | Dependabot | Weekly PRs, reviewed like any other change |
| Web | Flask, with htmx for UI | One process, `/api` and `/ui` blueprints |
| WSGI server | gunicorn | Inside the container. The Flask dev server is for development only |
| HTTP client | httpx | Only in `clients/`, with explicit timeouts |
| Logging | Standard library `logging` | JSON lines to stdout, see Logging |
| Container | Docker, rootless on the host | Multi-stage build with uv, see Container contract |
| Database | SQLite through the standard library `sqlite3` | No ORM and no query builder |
| Migrations | Numbered plain SQL files | Forward only, with a snapshot before each run |
| Configuration | Environment variables, secrets as files | Parsed once at startup into a frozen settings object |

### Layout

```text
PROJECT_SPEC.md
README.md
CLAUDE.md
pyproject.toml
.python-version
Dockerfile
.dockerignore
compose.yaml       what the app needs from the runner
.pre-commit-config.yaml
.betterleaks.toml
.data/             local development data, gitignored
docs/              interface docs, only when the project spec lists consumers
  openapi.yaml
  cli.md
agent-scratchpad/  per-task working notes, committed
src/<app>/
  core/            pure domain logic: types, rules, state transitions
    types.py
    errors.py
    <feature>.py
  repos/           SQLite repositories: plain SQL in, domain types out
  services/        one function per use case: load, call core, persist
  clients/         external service clients, shell only
  web/
    api.py         /api JSON routes
    ui.py          /ui HTML fragment routes for htmx
    templates/
  db/
    connection.py  connection setup and the transaction helper
    migrate.py     snapshot, then apply pending migrations
    migrations/    0001_init.sql, 0002_....sql
  config.py
  app.py           composition root: create_app(settings)
  serve.py         container entry point: migrate, then start gunicorn
tests/
  conftest.py      Hypothesis profiles, shared fixtures
  strategies.py    Hypothesis strategies that build domain types
  properties/      property tests, named by invariant ID
  models/          reference models
  repos/           repository tests against real SQLite
  clients/         client tests against recorded responses
  fixtures/        recorded responses, scrubbed
  smoke/           one test per route or entry point
  docs/            tests that interface docs match the code
```

### Import rules

Dependencies point downward: `web`, then `services`, then `repos`, then `core`. The core imports only itself and pure standard library modules.

```toml
[tool.importlinter]
root_package = "app"
include_external_packages = true

[[tool.importlinter.contracts]]
name = "Layers"
type = "layers"
layers = ["app.web", "app.services", "app.repos", "app.core"]

[[tool.importlinter.contracts]]
name = "Core is pure"
type = "forbidden"
source_modules = ["app.core"]
forbidden_modules = ["sqlite3", "flask", "os", "random", "time", "requests"]
```

Import rules cannot catch `datetime.now()` or `uuid4()` inside the core. Ban those calls for the core with ruff's banned-API rule in a core-scoped config. When first setting up a project, confirm each contract fails on a deliberate violation.

### Type checking

ty checks types, and ruff covers the annotation rules ty leaves to a linter. ty has no strict preset, so the stricter rules are set by hand. The configuration is based on [ty's migration guide](https://docs.astral.sh/ty/coming-from-mypy-or-pyright/).

```toml
[tool.ty.rules]
blanket-ignore-comment = "error"
dynamic-function-decorator-return = "error"
missing-type-argument = "error"
possibly-unresolved-reference = "error"
unsound-return-statement = "error"

[tool.ruff.lint]
extend-select = ["ANN", "PGH003"]
```

- The ANN rules require annotations on every function, and ANN401 bans `Any`. Together they enforce principle 3 for signatures. Tests may be exempted through per-file ignores.
- A suppression names its rule, as in `# ty: ignore[rule]`, and carries a reason. Blanket ignores fail the check.
- ty is pre-1.0. Pin the exact version and upgrade it deliberately. An upgrade counts as a check configuration change under principle 10.
- ty has no rule for inferred unknown types. The core imports only itself and the standard library, which keeps that gap small.

### Core conventions

- Domain values are frozen dataclasses with slots. Closed sets are `StrEnum`. IDs are `NewType` wrappers.
- Money is an integer count of minor units, or `Decimal`. Never `float`.
- Timestamps are timezone-aware UTC and arrive as arguments, such as `now: datetime`.
- Functions take values and return new values. A function that decides on a side effect returns a description of it for the shell to carry out.
- Expected domain failures raise a subclass of one `DomainError` defined in `core/errors.py`.
- Branches over an enum or union use `match` and end with `assert_never`.
- Pydantic is acceptable for parsing in the `web` layer. It does not appear in the core.

### Persistence: SQLite with plain-SQL repositories

SQL written in the open is reviewable, and the schema is where invariants are enforced. An ORM hides both.

**Connection setup.** One helper in `db/connection.py` opens every connection and applies these settings:

```python
conn = sqlite3.connect(path, isolation_level=None)
conn.execute("PRAGMA foreign_keys = ON")
conn.execute("PRAGMA journal_mode = WAL")
conn.execute("PRAGMA busy_timeout = 5000")
```

SQLite leaves foreign key enforcement off unless each connection turns it on. No code opens a connection any other way.

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

**Transactions.** The service layer owns them, one per use case. A `transaction(conn)` context manager issues `BEGIN IMMEDIATE`, then `COMMIT` on success or `ROLLBACK` on error.

**Migrations.** Migrations are T1. They are numbered SQL files applied in order by `db/migrate.py` when the app starts. An applied migration is never edited. A fix is a new migration.

Before applying any pending migration, the migration step snapshots the database with `VACUUM INTO` to `/data/backups/<timestamp>-pre-<version>.db`. If the snapshot fails, startup fails and nothing is migrated. The five most recent snapshots are kept. Rolling back means running the previous image against its pre-migration snapshot, since migrations only go forward. A test applies every migration to a database built from the previous release's schema and checks that the snapshot exists and opens.

### Web layer

- `create_app(settings)` builds the app and registers two blueprints: `/api` returns JSON and `/ui` returns HTML fragments for htmx.
- A handler parses input, calls a service, and renders the result. It holds no domain logic.
- Both blueprints call the same services. Writes always go through a service. Read-only handlers may call a repository directly.
- One error handler maps `DomainError` to a 4xx response. Anything else is logged and returns a 500.
- Templates and UI routes are T3 unless the project spec says otherwise.

**Request safety.** Apps have no authentication, but any web page open in the user's browser can still send requests to them. These rules block cross-site requests and DNS rebinding:

- Flask's `TRUSTED_HOSTS` is set from an `ALLOWED_HOSTS` setting. Requests with any other `Host` header are rejected.
- Mutating requests (POST, PUT, PATCH, DELETE) to `/ui` must carry `HX-Request: true`, and those to `/api` must have `Content-Type: application/json`. Anything else gets a 403. Both requirements force a browser preflight that cross-site pages cannot pass.
- Jinja autoescaping stays on. `|safe` and `Markup()` are never applied to data that came from a user or an import.
- Debug mode is never on in the image. `serve.py` refuses to start if it is set.
- If an app ever needs to be reachable from other machines, stop and ask: that requires authentication, which this spec does not yet define.

### External services

- Clients for external services live in `src/<app>/clients/`, part of the shell. They use httpx.
- Every request sets explicit connect and read timeouts. Retries are bounded, use backoff, and apply only to idempotent requests.
- Responses are parsed into domain types at the client. An unexpected shape raises an error; it never falls back to a default.
- Tests never reach the network. pytest-socket enforces this for the whole suite. Clients are tested against recorded real responses stored in `tests/fixtures/<service>/`, with secrets and personal data scrubbed before they are committed.
- Any new external service changes the app's network tier or egress allowlist, so it needs a project spec change.

### Configuration

`config.py` reads configuration once at startup and returns a frozen settings object. Ordinary values come from environment variables. A secret named `API_TOKEN` is read from the file that `API_TOKEN_FILE` points to; the plain `API_TOKEN` variable is accepted only in development, and setting both is an error. A missing required value stops startup with a clear error naming it. Paths default to the container layout, such as `DATA_DIR=/data`. The core never reads configuration; the shell passes in what it needs.

Secret values are wrapped in a `Secret` type whose `str` and `repr` both return `***`. Code calls `.reveal()` only at the point of use, such as building a request header. This keeps secrets out of logs, error pages, tracebacks, and change reports.

### Logging

- Standard library `logging`, configured once in `app.py` with a JSON formatter. Each line is one JSON object with `ts` (UTC, ISO 8601), `level`, `logger`, `event`, and any context fields.
- `event` is a short fixed string such as `import.completed`. Variable data goes in fields, never in the event string.
- Every web request gets a request ID, included in each log line for that request and returned in an `X-Request-ID` response header.
- Never log secrets, full request or response bodies, or imported file contents. Log counts and IDs instead.
- Levels: `error` for anything that needs the user's attention, `warning` for handled but unexpected conditions, `info` for state changes, `debug` for detail that is off by default.

### Local development

- `make dev` runs the Flask development server with debug on, against a local data directory `.data/`. The directory is gitignored and excluded from the image.
- `make seed` fills `.data/` with sample data by calling the service layer, so seed data obeys the same invariants as real data.
- Agents use `make dev` to try the UI and API. Real data is never copied into `.data/`.

### Container contract

This section defines what an app's image must do. How containers are started, where configuration and secrets come from, and how host ports are assigned belong to the runner, a separate project. Development and tests still run on the host with uv; the container is for real data and for the final smoke test.

**Image.**

```dockerfile
FROM python:3.13-slim@sha256:<digest> AS build
COPY --from=ghcr.io/astral-sh/uv:<version> /uv /bin/uv
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY src ./src
RUN uv sync --frozen --no-dev --no-editable

FROM python:3.13-slim@sha256:<digest>
RUN useradd --uid 10001 --no-create-home app \
 && mkdir /data && chown app:app /data
COPY --from=build /app/.venv /app/.venv
ENV PATH="/app/.venv/bin:$PATH" DATA_DIR=/data
USER app
EXPOSE 8000
HEALTHCHECK CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health')"]
CMD ["python", "-m", "app.serve"]
```

- Base images and the uv image are pinned by digest or exact version. Image tags are the git commit SHA.
- The Python version is declared once in `.python-version`. `requires-python` and the Dockerfile's base image tag must match it, and a CI step fails if they disagree.
- The app runs as a fixed non-root user. `/data` is created and owned by that user in the image, so a new named volume mounted there starts with the same ownership and is writable without host-side fixes.
- `serve.py` runs migrations once, then replaces itself with gunicorn. Migrations never run inside each worker.
- `.dockerignore` excludes `.git`, `.venv`, `.data`, `tests`, `docs`, `agent-scratchpad`, and any `.env` files.

**Runtime behavior.**

- All state lives under `/data`, mounted as a named volume. The root filesystem is read-only, with `/tmp` as tmpfs.
- Logs go to stdout as JSON lines, as described under Logging. The app never writes log files.
- `GET /health` returns 200 once migrations have run and the database opens. It checks nothing external.
- The app shuts down cleanly on SIGTERM, finishing in-flight requests.

**Ports.** Each container has its own network namespace, so every app uses the same fixed ports inside its container. The runner maps them to host ports.

| Role | Port | Notes |
| --- | --- | --- |
| Web | 8000 + n | An app serving `/ui` and `/api` from one process uses 8000 only |
| API | 8100 + n | Only for an API served by a separate process |
| Metrics | 9000 + n | Optional. Never exposed on a web or API port |

`n` counts additional endpoints of the same role, starting at 0.

**Network tiers.** Each app declares one tier, recorded in the project spec and in `compose.yaml`. The runner enforces it.

| Tier | Meaning |
| --- | --- |
| `isolated` | No network access beyond its published ports |
| `allowlisted` | Outbound access only to the listed domains, through a proxy the runner provides. The app honors `HTTPS_PROXY` |
| `open` | Unrestricted outbound access. Needs a recorded reason in the project spec |

**Manifest.** `compose.yaml` declares what the app needs and supplies no real values. Required variables use `${NAME:?}` so a missing value fails at start. Ports are listed with `expose`, never `ports`, because host mapping is the runner's job. Settings for the runner go in `x-` keys, which Compose ignores.

```yaml
x-network-tier: allowlisted
x-egress-allowlist: [api.example.com]

services:
  app:
    image: <app>:${GIT_SHA:?}
    read_only: true
    tmpfs: [/tmp]
    cap_drop: [ALL]
    security_opt: ["no-new-privileges:true"]
    expose: ["8000"]
    environment:
      LOG_LEVEL: ${LOG_LEVEL:-info}
      API_TOKEN_FILE: /run/secrets/api_token
    secrets: [api_token]
    volumes: [data:/data]
    restart: unless-stopped

secrets:
  api_token:
    file: ${API_TOKEN_PATH:?}

volumes:
  data:
```

- A test parses `compose.yaml` and the settings class and fails if the app reads a setting the manifest does not declare, or the manifest declares one the app does not read.
- Backup and restore of the data volume are documented in the README until the runner takes them over.

### Testing

- **Properties.** One test per invariant at minimum, in `tests/properties/`, named like `test_inv_3_balance_never_negative`. Strategies in `tests/strategies.py` build real domain types.
- **Stateful tests.** Use Hypothesis `RuleBasedStateMachine` to run the same operations against the implementation and the reference model in `tests/models/`.
- **Failures found by Hypothesis.** Fix the code, then pin the failing case with `@example`. Do not narrow the strategy to avoid it.
- **Hypothesis profiles.** `conftest.py` registers a `dev` profile (about 50 examples) and a `ci` profile (about 1,000), chosen by the `HYPOTHESIS_PROFILE` environment variable. CI sets `ci`. The `.hypothesis/` directory is gitignored.
- **No network.** `addopts` in `pyproject.toml` includes `--disable-socket`. The container smoke run is the one exception and allows only `127.0.0.1`.
- **Repositories.** Test against a real SQLite database built from the real migrations. Never mock the database. Each type has a save-then-load round-trip test.
- **Schema constraints.** Each invariant enforced in the schema has a test that tries to break it with raw SQL and expects `IntegrityError`.
- **Smoke tests.** One per route or entry point, using the Flask test client and a temporary database. The same tests run over HTTP against the built container in CI.
- **Mutation.** Run mutmut over `src/<app>/core` whenever the core changes. T1 modules need every survivor killed or justified. T2 modules report the score.

### Documentation

- **README.** Sections in this order: Overview, Architecture (components and data flow), Running locally, Decisions. Keep it to a few screens. Detail lives in code, docstrings, and `docs/`.
- **Decisions.** One entry per decision: the date, what was decided, the alternatives considered, the reason, and the issue number if there is one.
- **API docs.** `docs/openapi.yaml`, covering `/api` only. Prefer generating it from the Pydantic request and response models at the web boundary. Whether generated or hand-written, a test in `tests/docs/` compares the path and method of every `/api` rule in Flask's URL map against the spec, and fails on anything missing or extra.
- **CLI docs.** `docs/cli.md`, generated from each command's `--help` output by `make docs`. A test fails if the committed file differs from freshly generated output.
- **Issues.** GitHub issues, managed through the `gh` CLI. Each issue gets its own branch and pull request, opened through gh, with the change report as the PR body. Commit messages and branch names include the issue number, as in `fix: reversal balance (#42)`.
- **Scratchpad files.** Name them `agent-scratchpad/<issue>-<slug>.md`, or `<date>-<slug>.md` before issues exist. Use this template:

```markdown
# <issue number and title>

## Context
What the task is and what was found before starting.

## Decisions
- Decision. Alternatives considered. Reason.

## Open questions

## Promoted
- What moved to the README, PROJECT_SPEC.md, or CLAUDE.md
```

### Pre-commit and secret scanning

pre-commit runs the fast checks before every commit. The Python tools run as local hooks through `uv run`, so their versions come from `uv.lock` and match CI exactly. betterleaks is not a Python package, so it runs from its own repository, pinned to a release tag.

```yaml
repos:
  - repo: https://github.com/betterleaks/betterleaks
    rev: <exact release tag>
    hooks:
      - id: betterleaks
  - repo: local
    hooks:
      - id: ruff-check
        name: ruff check
        entry: uv run ruff check
        language: system
        types: [python]
      - id: ruff-format
        name: ruff format
        entry: uv run ruff format --check
        language: system
        types: [python]
      - id: ty
        name: ty
        entry: uv run ty check
        language: system
        pass_filenames: false
      - id: import-linter
        name: import-linter
        entry: uv run lint-imports
        language: system
        pass_filenames: false
```

- **Setup.** pre-commit is a dev dependency. Project setup runs `uv run pre-commit install`, and `CLAUDE.md` says so.
- **Tests stay out of the hook.** pytest and mutmut are too slow for every commit. They run in `make check` and in CI.
- **betterleaks version.** Betterleaks is moving from v1 to v2. At project setup, pin the latest stable release, and confirm the hook and the CI command against that version's docs, since flags differ between major versions.
- **betterleaks config.** The project owns its `.betterleaks.toml` instead of extending the upstream default, so the rule set only changes when someone reviews it. Scans in hooks and CI run without validation, so they make no network calls.
- **False positives.** Add a filter to `.betterleaks.toml` with a comment giving the reason. Inline `betterleaks:allow` comments are allowed only in test fixtures. Either change appears in the change report.
- **CI.** CI runs `uv run pre-commit run --all-files`, then a betterleaks scan of every commit in the PR. The commit scan catches a secret added in one commit and removed in a later one, which the final diff hides.
- **Ruff security rules.** Add `"S"` to ruff's `extend-select`. That catches hardcoded passwords and other common security mistakes. Tests may ignore `S101`, which flags `assert`.
- **If a secret is committed.** Rotate it first. Removing it from history comes second, because the credential may already have been copied.

### Required checks

A single `make check` target runs the first five. The change report lists the result of each.

| Check | Command | When |
| --- | --- | --- |
| Lint | `uv run ruff check .` | Every change |
| Format | `uv run ruff format --check .` | Every change |
| Types | `uv run ty check` | Every change |
| Import rules | `uv run lint-imports` | Every change |
| Tests | `uv run pytest` | Every change |
| Mutation | `uv run mutmut run` | Any change under `core/` |
| Secrets | betterleaks hook, then a scan of the PR's commits in CI | Every commit |
| Dependency audit | `uv run pip-audit` | Every change, in CI |
| Image | `docker build`, then the smoke tests against the running container | Every change, in CI |

## Part 3: Starting a new project

A new project begins with its project spec, and no code is written until the user approves it. The agent builds the spec by interviewing the user and never invents invariants.

### Procedure

1. **Interview.** Ask the questions below, one topic at a time. Restate each answer as a candidate entity, transition, or invariant and confirm it.
2. **Draft.** Write `PROJECT_SPEC.md` from the template. Record anything unanswered under open questions instead of guessing.
3. **Approve.** The user reads the full draft and approves it. This is the one document the user always reviews line by line.
4. **Scaffold.** Create the Part 2 layout and a thin CLAUDE.md, then configure every check. Confirm each check fails on a deliberate violation.
5. **Write the oracles.** Write properties and reference models for the approved invariants before the implementation.
6. **Implement.** Build against the properties. Map tiered concepts to modules as they appear and record the mapping in the spec.

### Interview questions

- What does the app do, in two or three sentences, and who uses it?
- What are the core entities, and how do they relate?
- Which entities have states? What transitions are allowed, and under what conditions?
- What must never happen? What must always be true?
- Which failures would go unnoticed? Which could not be undone?
- What external systems are involved, and what can be trusted about their data?
- What network access does the app need, and to which domains? This sets its network tier.
- What is out of scope, and where is rough acceptable?
- Does anything need to depart from the default stack?

### Writing invariants

- One testable statement each, in the language of the domain.
- State what holds, not how the code achieves it.
- Start with the five to ten whose violation would hurt most. The list grows during the build.
- IDs are stable and never reused. A dropped invariant is marked retired, not deleted.

| Quality | Example |
| --- | --- |
| Good | The entries of a transfer sum to zero. |
| Good | A closed account accepts no new entries. |
| Too vague | Transfers are handled correctly. |
| Describes the how | Transfers are saved inside a transaction. |

### Assigning tiers before modules exist

Assign tiers to domain concepts first, such as "ledger entries" or "deletion". The questions about unnoticed and irreversible failures identify T1. As modules appear, each inherits the highest tier of the concepts it touches.

### Template

```markdown
# Project spec: <name>

## Purpose
Two or three sentences. What it does and who uses it.

## Entities
| Entity | Description | Key fields | Relations |
| --- | --- | --- | --- |

## State machines
| Entity | From | Event | To | Condition |
| --- | --- | --- | --- | --- |

## Invariants
| ID | Statement | Tier | Enforced in | Property |
| --- | --- | --- | --- | --- |
| INV-1 | ... | T1 | core, schema CHECK | tests/properties/test_inv_1_... |

## Risk tiers
| Concept or module | Tier | Reason |
| --- | --- | --- |

## Reference models
Which behaviors have a model, and where it lives.

## Runtime
- Network tier: isolated / allowlisted / open, with the reason
- Egress allowlist: domains, if allowlisted
- Ports: roles used, such as web 8000
- Secrets: names and what each is for

## External consumers
Who depends on this project's interfaces. Listing one makes interface docs required.
| Consumer | Interface | Docs |
| --- | --- | --- |

## Deviations from the base spec
Each deviation with its reason.

## Open questions

## Change log
| Date | Change | Approved by |
| --- | --- | --- |
```

### Changing the project spec

The order is always the same: the agent proposes, the user approves, then the spec changes, then the properties, then the code. Each change gets a line in the change log.

Three events trigger a proposal:

- A task needs a rule the spec does not state.
- A property fails and the invariant itself looks wrong.
- A bug reached use in T1 or T2 code. It becomes a new invariant or a new property on an existing one.
