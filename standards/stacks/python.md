# Stack: Python

These are the defaults for every Python project. They apply in addition to `core.md` and the project type and topic documents the project spec lists. A project departs from them only through a deviation recorded in its project spec.

## Default stack

| Concern | Default | Notes |
| --- | --- | --- |
| Packaging | uv | `pyproject.toml`, a committed `uv.lock`, and `.python-version` |
| Lint and format | ruff | Format check runs in CI |
| Types | ty | Exact version pinned. Stricter rules set by hand, see Type checking |
| Tests | pytest with Hypothesis | Properties for the core, real SQLite for repositories, no network |
| Mutation testing | mutmut | Scoped to `core` |
| Import rules | import-linter | Contracts shown below |
| Git hooks | pre-commit | Runs the fast checks before each commit, see `core.md` and Pre-commit hooks |
| Secret scanning | betterleaks | Exact version pinned, with a project-owned `.betterleaks.toml` |
| Dependency audit | pip-audit | Runs in CI |
| Dependency updates | Dependabot | Weekly PRs, reviewed like any other change |
| Web | Flask, with htmx for UI | One process, `/api` and `/ui` blueprints |
| WSGI server | gunicorn | Inside the container. The Flask dev server is for development only |
| HTTP client | httpx | Only in `clients/`, with explicit timeouts |
| Logging | Standard library `logging` | JSON lines to stdout, see Logging |
| Container | Docker, rootless on the host | Multi-stage build with uv, see Container image |
| Database | SQLite through the standard library `sqlite3` | No ORM and no query builder |
| Migrations | Numbered plain SQL files | Forward only, with a snapshot before each run |
| Configuration | Environment variables, secrets as files | Parsed once at startup into a frozen settings object |

## Layout

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

## Import rules

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

## Type checking

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

## Core conventions

- Domain values are frozen dataclasses with slots. Closed sets are `StrEnum`. IDs are `NewType` wrappers.
- Money is an integer count of minor units, or `Decimal`. Never `float`.
- Timestamps are timezone-aware UTC and arrive as arguments, such as `now: datetime`.
- Functions take values and return new values. A function that decides on a side effect returns a description of it for the shell to carry out.
- Expected domain failures raise a subclass of one `DomainError` defined in `core/errors.py`.
- Branches over an enum or union use `match` and end with `assert_never`.
- Pydantic is acceptable for parsing in the `web` layer. It does not appear in the core.

## SQLite

These implement `topics/sqlite.md` in Python.

**Connection setup.** One helper in `db/connection.py` opens every connection:

```python
conn = sqlite3.connect(path, isolation_level=None)
conn.execute("PRAGMA foreign_keys = ON")
conn.execute("PRAGMA journal_mode = WAL")
conn.execute("PRAGMA busy_timeout = 5000")
```

**Transactions.** A `transaction(conn)` context manager in `db/connection.py` implements the rule in `topics/sqlite.md`. Migrations are applied by `db/migrate.py`.

## Web layer

- `create_app(settings)` builds the app and registers two blueprints: `/api` returns JSON and `/ui` returns HTML fragments for htmx.
- A handler parses input, calls a service, and renders the result. It holds no domain logic.
- Both blueprints call the same services. Writes always go through a service. Read-only handlers may call a repository directly.
- One error handler maps `DomainError` to a 4xx response. Anything else is logged and returns a 500.
- Templates and UI routes are T3 unless the project spec says otherwise.

**Request safety** (`project-types/service.md`) in Flask:

- Flask's `TRUSTED_HOSTS` is set from an `ALLOWED_HOSTS` setting. Requests with any other `Host` header are rejected.
- Mutating requests (POST, PUT, PATCH, DELETE) to `/ui` must carry `HX-Request: true`, and those to `/api` must have `Content-Type: application/json`. Anything else gets a 403. Both requirements force a browser preflight that cross-site pages cannot pass.
- Jinja autoescaping stays on. `|safe` and `Markup()` are never applied to data that came from a user or an import.
- Debug mode is never on in the image. `serve.py` refuses to start if it is set.

## External services

These implement the rules in `core.md`.

- Clients for external services live in `src/<app>/clients/`, part of the shell. They use httpx.
- Tests block the network with pytest-socket. Recorded responses live in `tests/fixtures/<service>/`.

## Configuration

`config.py` implements the configuration rules in `project-types/service.md` and returns a frozen settings object.

Secret values are wrapped in a `Secret` type whose `str` and `repr` both return `***`. Code calls `.reveal()` only at the point of use, such as building a request header. This keeps secrets out of logs, error pages, tracebacks, and change reports.

## Logging

Standard library `logging`, configured once in `app.py` with a JSON formatter that writes the format in `project-types/service.md`.

## Local development

- `make dev` runs the Flask development server with debug on, against a local data directory `.data/`. The directory is gitignored and excluded from the image.
- `make seed` fills `.data/` with sample data by calling the service layer, so seed data obeys the same invariants as real data.
- Agents use `make dev` to try the UI and API. Real data is never copied into `.data/`.

## Container image

This implements the container contract in `project-types/service.md`.

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

- The Python version is declared once in `.python-version`. `requires-python` and the Dockerfile's base image tag must match it, and a CI step fails if they disagree.
- `serve.py` runs migrations once, then replaces itself with gunicorn. Migrations never run inside each worker.
- `.dockerignore` also excludes `.venv`.

## Testing

- **Properties.** One test per invariant at minimum, in `tests/properties/`, named like `test_inv_3_balance_never_negative`. Strategies in `tests/strategies.py` build real domain types.
- **Stateful tests.** Use Hypothesis `RuleBasedStateMachine` to run the same operations against the implementation and the reference model in `tests/models/`.
- **Failures found by Hypothesis.** Fix the code, then pin the failing case with `@example`. Do not narrow the strategy to avoid it.
- **Hypothesis profiles.** `conftest.py` registers a `dev` profile (about 50 examples) and a `ci` profile (about 1,000), chosen by the `HYPOTHESIS_PROFILE` environment variable. CI sets `ci`. The `.hypothesis/` directory is gitignored.
- **No network.** `addopts` in `pyproject.toml` includes `--disable-socket`. The container smoke run is the one exception and allows only `127.0.0.1`.
- **SQLite.** Repository and schema tests follow `topics/sqlite.md`. A broken constraint raises `sqlite3.IntegrityError`.
- **Smoke tests.** One per route or entry point, using the Flask test client and a temporary database. The same tests run over HTTP against the built container in CI.
- **Mutation.** Run mutmut over `src/<app>/core` whenever the core changes. T1 modules need every survivor killed or justified. T2 modules report the score.

## Documentation

- **API docs.** `docs/openapi.yaml`, covering `/api` only. Prefer generating it from the Pydantic request and response models at the web boundary. Whether generated or hand-written, a test in `tests/docs/` compares the path and method of every `/api` rule in Flask's URL map against the spec, and fails on anything missing or extra.

## Pre-commit hooks

These are added to the betterleaks hook from `core.md`. The Python tools run as local hooks through `uv run`, so their versions come from `uv.lock` and match CI exactly.

```yaml
repos:
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
- **CI.** CI runs `uv run pre-commit run --all-files` in place of the plain `pre-commit` command in `core.md`.
- **Ruff security rules.** Add `"S"` to ruff's `extend-select`. That catches hardcoded passwords and other common security mistakes. Tests may ignore `S101`, which flags `assert`.

## Required checks

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
