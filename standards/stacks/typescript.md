# Stack: TypeScript

These are the defaults for every TypeScript project, on Node and in the browser. They apply in addition to `core.md` and the project type and topic documents the project spec lists. A project departs from them only through a deviation recorded in its project spec.

Code is TypeScript everywhere. Node runs `.ts` files directly. Code that runs in the browser is compiled by `tsc` alone into plain ES modules, which the browser loads as they are. There is no bundler.

## Default stack

| Concern | Default | Notes |
| --- | --- | --- |
| Runtime | Node 26 (Active LTS) | Version in `.node-version` and `engines` in `package.json` |
| Packages | npm, with workspaces for repos with several projects | A committed `package-lock.json`. Supply-chain settings in `.npmrc`, see Dependencies |
| Types | TypeScript 7 (`tsc`) | Exact version pinned. Strict settings in `tsconfig.json`, see Type checking |
| Lint | ESLint with typescript-eslint | Type-aware rules, see Lint rules |
| Format | Prettier | Check mode in pre-commit and CI |
| Import rules | ESLint: `eslint-plugin-boundaries` and restricted imports and globals | See Import rules |
| Tests | Vitest | Node tests, plus browser mode for code that runs in the browser |
| Properties | fast-check | With Vitest |
| Mutation testing | StrykerJS with the Vitest runner and the TypeScript checker | Scoped to `core` |
| End-to-end | Playwright test | Only for browser apps, see `project-types/browser-app.md` when it exists |
| Git hooks | pre-commit | Runs the fast checks before each commit, see `core.md` and Pre-commit hooks |
| Secret scanning | betterleaks | As in `core.md` |
| Dependency audit | `npm audit` | Runs in CI |
| Dependency updates | Dependabot | Weekly PRs with a cooldown, reviewed like any other change |
| SQLite on Node | `node:sqlite` | Built in, no native addon. A release candidate, not yet stable: confirm its status at project setup |
| Logging | A small module over `console`, writing JSON lines | No logging library |
| Container | Docker, rootless on the host | `node:26-slim`, runs `.ts` directly, see Container image |
| Configuration | Environment variables, secrets as files | Parsed once at startup into a frozen settings object |

The web framework for a server is not chosen yet. A small server may need only `node:http`. Decide it in the project spec, under the dependency rules below.

## Dependencies

Every dependency is code the agent didn't write and nobody reviewed. These rules come first, before any tool choice above.

- **Prefer what is built in.** Node's standard library, the web platform (`fetch`, WebCrypto, streams), and TypeScript itself cover most needs. Use them before reaching for a package.
- **No dependency for simple functionality.** If the code would be a few dozen lines, write it: argument parsing, small parsers and validators, retries with backoff, ID generation, date formatting, deep equality.
- **A new runtime dependency needs a reason in the project spec**: what it does that would be costly or risky to write, and roughly how many packages it pulls in. Dev-only tools from the table above need none.
- **No bundler** unless the project spec records why one is needed.
- **The change report lists every new or upgraded dependency**, as `core.md` requires. A reviewer treats a new runtime dependency as at least T2.
- **`.npmrc` holds the supply-chain settings:**

```ini
ignore-scripts=true
min-release-age=3
allow-git=none
engine-strict=true
```

Confirm each setting against the npm version in use at project setup.

- `ignore-scripts=true` means dependency install scripts never run. A package that needs one is a reason to choose a different package, or a recorded deviation.
- `min-release-age=3` refuses versions published less than three days ago, so a compromised release is usually caught and pulled before it can be installed.
- Undeclared imports are caught by lint (`import-x/no-extraneous-dependencies`). npm allows importing a package that only arrived as a dependency of another one; the rule refuses it.

## Layout

A single project:

```text
PROJECT_SPEC.md
README.md
CLAUDE.md
package.json
package-lock.json
.npmrc
.node-version
tsconfig.json         type checking for all code
tsconfig.browser.json emit for code that runs in the browser
eslint.config.js
.prettierrc.json
vitest.config.ts
stryker.config.json
.pre-commit-config.yaml
.betterleaks.toml
agent-scratchpad/
src/
  core/               pure domain logic: types, rules, state transitions
    types.ts
    errors.ts
    <feature>.ts
  shell/              everything with effects, one folder per kind
    repos/            storage access: plain SQL in, domain types out
    clients/          external service clients
    services/         one function per use case: load, call core, persist
  config.ts
  main.ts             entry point
tests/
  strategies.ts       fast-check arbitraries that build domain types
  properties/         property tests, named by invariant ID
  models/             reference models
  shell/              tests against real SQLite and recorded responses
  fixtures/
  smoke/
dist/                 compiled browser code, gitignored
```

A repo with several projects uses npm workspaces. Each project has its own directory with its own `PROJECT_SPEC.md`, `package.json`, and the layout above. Shared code is a project of its own, and other projects depend on it through the workspace, never through relative paths into its source.

## Type checking

`tsc` runs with `--noEmit` for all code. Node never type checks: it only strips the types.

```jsonc
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "erasableSyntaxOnly": true,
    "verbatimModuleSyntax": true,
    "module": "nodenext",
    "target": "es2024",
    "rewriteRelativeImportExtensions": true,
    "noEmit": true
  }
}
```

- `erasableSyntaxOnly` refuses TypeScript syntax that changes runtime behavior, such as enums, namespaces, and parameter properties. That is what lets Node run the files directly, and it keeps compiled browser code identical to the source apart from types.
- Imports use the `.ts` extension. `rewriteRelativeImportExtensions` turns them into `.js` in browser output.
- `tsconfig.browser.json` extends this file, sets `noEmit: false`, `outDir: "dist"`, and `lib` to the DOM libraries, and includes only browser and shared code.
- **TypeScript 7 and tools that need the compiler API.** TypeScript 7.0 has no full programmatic API. A tool that needs one, such as typescript-eslint or Stryker's TypeScript checker, gets TypeScript 6 installed alongside under an npm alias, for that tool alone. Drop the alias once the tool supports TypeScript 7. Confirm the current state at project setup.
- `any` is banned in the core, including implicit `any` from untyped values. A suppression names its rule and gives a reason.

## Lint rules

Start from typescript-eslint's `strictTypeChecked` and `stylisticTypeChecked` configs. These rules matter most, because they catch silent failures, and must stay on:

- `@typescript-eslint/no-floating-promises`, `no-misused-promises`, `await-thenable`: an unawaited promise is a silent failure.
- `@typescript-eslint/switch-exhaustiveness-check`: every branch over a union is handled.
- `@typescript-eslint/no-explicit-any` and the `no-unsafe-*` rules.
- `@typescript-eslint/only-throw-error`.
- `import-x/no-extraneous-dependencies`, from `eslint-plugin-import-x`.

Prettier owns formatting. ESLint runs no formatting rules.

## Import rules

Dependencies point inward: `shell` may import `core`; `core` imports only itself.

- `eslint-plugin-boundaries` defines `core` and `shell` as elements and allows only `shell → core`.
- For files in `src/core/`:
  - `no-restricted-imports` bans every `node:` module and every package except those the project spec names as pure.
  - `no-restricted-globals` bans `fetch`, `crypto`, `localStorage`, `indexedDB`, `navigator`, `window`, `document`, and `process`.
  - `no-restricted-syntax` bans `Date.now()`, `new Date()` with no arguments, and `Math.random()`. Time and randomness arrive as arguments.
- When first setting up a project, confirm each rule fails on a deliberate violation.

## Core conventions

- Domain values are `readonly` object types, created by functions that validate them. IDs are branded types, such as `type TrackId = string & { readonly __brand: "TrackId" }`.
- Closed sets are string literal unions, never enums (`erasableSyntaxOnly` forbids enums).
- Branches over a union use `switch`, which `switch-exhaustiveness-check` keeps complete.
- Money is an integer count of minor units, or `bigint`. Never a fractional `number`.
- Timestamps arrive as arguments, in UTC.
- Functions take values and return new values. A function that decides on a side effect returns a description of it for the shell to carry out.
- Expected domain failures throw a subclass of one `DomainError` in `core/errors.ts`.
- Input is parsed into domain types at the boundary by hand-written parsers, tested with fast-check. A validation library needs a reason in the project spec.

## Configuration and secrets

`src/config.ts` implements the configuration rules in `project-types/service.md` and returns a frozen settings object. Secret values are wrapped in a `Secret` class whose `toString`, `toJSON`, and `[Symbol.for("nodejs.util.inspect.custom")]` all return `***`. Code calls `.reveal()` only at the point of use.

## External services

These implement the rules in `core.md`.

- Clients live in `src/shell/clients/` and use the built-in `fetch`.
- Every request passes an `AbortSignal.timeout(...)`. Retries are bounded and written in the project.
- A Vitest setup file replaces `globalThis.fetch` with a function that throws, so a test that reaches the network fails. Clients are tested by injecting a recorded response from `tests/fixtures/<service>/`.

## SQLite

These implement `topics/sqlite.md` with `node:sqlite`.

- One helper opens every connection with `DatabaseSync` and sets `PRAGMA foreign_keys = ON`, `PRAGMA journal_mode = WAL`, and `PRAGMA busy_timeout = 5000`.
- A `transaction(db, fn)` helper issues `BEGIN IMMEDIATE`, then `COMMIT`, or `ROLLBACK` if `fn` throws.
- Statements are module-level constants, prepared once. Values are always bound as parameters.

## Testing

- **Properties.** One test per invariant at minimum, in `tests/properties/`, named like `inv-3-balance-never-negative.test.ts`. Arbitraries in `tests/strategies.ts` build real domain types.
- **Stateful tests.** fast-check's model-based testing (`fc.commands`) runs the same operations against the implementation and the reference model in `tests/models/`.
- **Failures found by fast-check.** Fix the code, then pin the failing case with `examples`. Do not narrow the arbitrary to avoid it.
- **Runs.** `numRuns` is about 100 locally and 1,000 in CI, set from an environment variable in one place.
- **Browser code** runs its tests in Vitest's browser mode with the Playwright provider, in Firefox, so WebCrypto, OPFS, and other browser APIs are the real ones.
- **SQLite.** Repository and schema tests follow `topics/sqlite.md`.
- **Mutation.** Run Stryker over `src/core` whenever the core changes. T1 modules need every survivor killed or justified. T2 modules report the score.

## Logging

A small `log` module in the shell writes the JSON-line format from `project-types/service.md` to stdout through `console.log`. No logging library.

## Container image

This implements the container contract in `project-types/service.md`. The image runs TypeScript directly, so there is no build stage for Node code.

```dockerfile
FROM node:26-slim@sha256:<digest>
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data
COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev
COPY src ./src
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 8000
HEALTHCHECK CMD ["node", "-e", "fetch('http://127.0.0.1:8000/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "src/main.ts"]
```

- The image uses the built-in non-root `node` user.
- `.dockerignore` also excludes `node_modules` and `dist`.
- Node does not strip types inside `node_modules`, so a workspace dependency on shared TypeScript code is copied in as source, not installed as a package. The project spec records how.

## Documentation

- **API docs.** `docs/openapi.yaml`, covering the API routes only. A test in `tests/docs/` compares every route the server registers with the spec, and fails on anything missing or extra.
- **CLI docs.** Generated by `npm run docs`.

## Pre-commit hooks

These are added to the betterleaks hook from `core.md`. They run the project's own npm scripts, so tool versions come from `package-lock.json` and match CI exactly.

```yaml
  - repo: local
    hooks:
      - id: eslint
        name: eslint
        entry: npm run --silent lint --
        language: system
        types_or: [ts, javascript]
      - id: prettier
        name: prettier
        entry: npx prettier --check
        language: system
        types_or: [ts, javascript, json, yaml, markdown, css, html]
      - id: tsc
        name: tsc
        entry: npm run --silent typecheck
        language: system
        pass_filenames: false
```

- **CI.** CI runs `npm ci`, then `pre-commit run --all-files`.

## Required checks

A single `npm run check` script runs the first five. The change report lists the result of each.

| Check | Command | When |
| --- | --- | --- |
| Lint | `npm run lint` | Every change |
| Format | `npx prettier --check .` | Every change |
| Types | `npm run typecheck` (`tsc --noEmit`) | Every change |
| Tests | `npm test` (Vitest, Node and browser) | Every change |
| Audit | `npm audit --audit-level=high` | Every change |
| Mutation | `npx stryker run` | Any change under `src/core/` |
| Secrets | betterleaks hook, then a scan of the PR's commits in CI | Every commit |
| End-to-end | `npx playwright test` | Browser apps, every change |
| Image | `docker build`, then the smoke tests against the running container | Services, every change, in CI |
