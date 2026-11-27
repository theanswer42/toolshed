# Stack: TypeScript

These are the defaults for every TypeScript project, on Node and in the browser. They apply in addition to `core.md` and the project type and topic documents the project spec lists. A project departs from them only through a deviation recorded in its project spec.

Code is TypeScript everywhere. Node runs `.ts` files directly. Code that runs in the browser is compiled by `tsc` alone into plain ES modules, which the browser loads through an import map. There is no bundler.

## Default stack

| Concern | Default | Notes |
| --- | --- | --- |
| Runtime | Node 26 (Active LTS) | Version in `.node-version` and `engines` in `package.json` |
| Packages | npm 12, pinned, with workspaces for repos with several projects | A committed `package-lock.json`. Node 26 bundles npm 11, so npm 12 is installed explicitly, see Dependencies |
| Types | TypeScript 7 (`tsc`), plus TypeScript 6 for tools that need its API | Exact versions pinned. Three independent configs for core, Node, and browser code, see Type checking |
| Node types | `@types/node` | Listed in `types` for Node code only |
| Lint | ESLint with typescript-eslint | Type-aware rules, see Lint rules |
| Format | Prettier | Check mode in pre-commit and CI |
| Import rules | ESLint: `eslint-plugin-boundaries` and restricted imports and globals | Backed by the type checker, see Import rules |
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

**npm version.** The supply-chain defaults below depend on npm 12: it blocks dependency install scripts and git dependencies unless they are allowed. Node 26 still bundles npm 11, so the project pins npm 12 and installs exactly that version wherever it runs:

```jsonc
// package.json
{
  "engines": { "node": "26.x", "npm": "12.x" },
  "devEngines": {
    "packageManager": { "name": "npm", "version": "<exact 12.x>", "onFail": "error" }
  }
}
```

The image and CI run `npm install -g npm@<the same exact version>` before `npm ci`.

**`.npmrc`:**

```ini
ignore-scripts=true
min-release-age=3
allow-git=none
engine-strict=true
```

- `ignore-scripts=true` keeps dependency install scripts off even if a future default changes. A package that needs one is a reason to choose a different package, or a recorded deviation.
- `min-release-age=3` refuses versions published less than three days ago, so a compromised release is usually caught and pulled before it can be installed.
- `engine-strict=true` makes the `engines` versions binding.

Confirm each setting against the pinned npm version at project setup.

**Undeclared imports** are caught by lint (`import-x/no-extraneous-dependencies`). npm allows importing a package that only arrived as a dependency of another one; the rule refuses it.

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
tsconfig.base.json    shared compiler options
tsconfig.core.json    src/core: no DOM, no Node
tsconfig.node.json    Node code
tsconfig.browser.json browser code, emits to dist/
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
  main.ts             composition root: builds clients and repos, hands them to services, starts entry points
  shell/              everything with effects
    entry/            entry points: HTTP routes, CLI commands
    services/         one function per use case: load, call core, persist
    repos/            storage access: plain SQL in, domain types out
    clients/          external service clients
  config.ts
tests/
  setup.ts            network stubs, see Testing
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

Node never type checks: it only strips the types. There are three independent configs, with no project references between them. `npm run typecheck` runs them in sequence:

```sh
tsc -p tsconfig.core.json && tsc -p tsconfig.node.json && tsc -p tsconfig.browser.json
```

Each part of the code gets the globals it may use, and no others, so the type checker refuses the wrong globals before lint runs. The configs' `include`s overlap: core is checked three times, once alone for purity and once inside each program that uses it. That is fine because nothing references anything.

**Shared base** (`tsconfig.base.json`, extended by the three below):

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
    "rewriteRelativeImportExtensions": true
  }
}
```

| Config | Includes | `lib` | `types` | Emits |
| --- | --- | --- | --- | --- |
| `tsconfig.core.json` | `src/core` | `["es2024"]` | `[]` | No (`noEmit`) |
| `tsconfig.node.json` | Node code and its tests, plus the core and shared source they use | `["es2024"]` | `["node"]` | No (`noEmit`) |
| `tsconfig.browser.json` | Browser code, plus the core and shared source it uses | `["es2024", "dom", "dom.iterable"]` | `[]` | Yes, all of it, to `dist/` |

- With `lib: ["es2024"]` and no types, `fetch`, `crypto`, `document`, and `process` don't exist in the core, so code that uses them doesn't compile there.
- Node code can't reference DOM globals, and browser code can't reference Node's.
- The browser config compiles the core and shared source it includes, so `dist/` holds their JavaScript too, not just their types.
- `erasableSyntaxOnly` refuses TypeScript syntax that changes runtime behavior, such as enums, namespaces, and parameter properties. That is what lets Node run the files directly, and it keeps compiled browser code identical to the source apart from types.
- Imports use the `.ts` extension. `rewriteRelativeImportExtensions` turns them into `.js` in browser output.
- `any` is banned, including implicit `any` from untyped values. A suppression names its rule and gives a reason.

**TypeScript 7 and tools that need the compiler API.** TypeScript 7.0 has no full programmatic API. Tools that need one, such as typescript-eslint and Stryker's TypeScript checker, import the bare `typescript` package. So `typescript` resolves to TypeScript 6, and TypeScript 7 is installed under its own name for `tsc`:

```jsonc
// package.json, devDependencies
{
  "typescript": "npm:@typescript/typescript6@<exact 6.x>",
  "@typescript/native": "npm:typescript@<exact 7.x>"
}
```

The `typecheck` script calls TypeScript 7's `tsc` explicitly, for all three configs. Remove the aliases once the tools support TypeScript 7's API. Confirm the current state at project setup.

## Lint rules

Start from typescript-eslint's `strictTypeChecked` and `stylisticTypeChecked` configs. These rules matter most, because they catch silent failures, and must stay on:

- `@typescript-eslint/no-floating-promises`, `no-misused-promises`, `await-thenable`: an unawaited promise is a silent failure.
- `@typescript-eslint/switch-exhaustiveness-check`: every branch over a union is handled.
- `@typescript-eslint/no-explicit-any` and the `no-unsafe-*` rules.
- `@typescript-eslint/only-throw-error`.
- `import-x/no-extraneous-dependencies`, from `eslint-plugin-import-x`.

Prettier owns formatting. ESLint runs no formatting rules.

## Import rules

Dependencies point inward. `eslint-plugin-boundaries` defines each folder below as an element and allows only these imports:

| From | May import |
| --- | --- |
| `main.ts` | everything in `shell`, `core` |
| `shell/entry` | `shell/services`, `core` |
| `shell/services` | `shell/repos`, `shell/clients`, `core` |
| `shell/repos` | `core` |
| `shell/clients` | `core` |
| `core` | `core` |

`main.ts` is the composition root, outside the layers like `app.py` in the Python stack: it constructs clients and repos and hands them to services. Nothing imports it. Read-only entry points may also import `shell/repos`, as in the Python stack; writes always go through a service.

For files in `src/core/`, lint adds a second layer to the type checker:

- `no-restricted-imports` bans every `node:` module and every package except those the project spec names as pure.
- `no-restricted-globals` bans `globalThis`, `self`, `fetch`, `crypto`, `localStorage`, `indexedDB`, `navigator`, `window`, `document`, and `process`. Banning `globalThis` and `self` closes the `globalThis.fetch(...)` route around the others.
- `no-restricted-syntax` bans `Date.now()`, `new Date()` with no arguments, and `Math.random()`. These exist in the ES libraries, so only lint catches them. Time and randomness arrive as arguments.

When first setting up a project, confirm each rule, and each tsconfig's globals, fails on a deliberate violation.

## Core conventions

- Domain values are `readonly` object types, created by functions that validate them. IDs are branded types, such as `type TrackId = string & { readonly __brand: "TrackId" }`.
- Closed sets are string literal unions, never enums (`erasableSyntaxOnly` forbids enums).
- Branches over a union use `switch`, which `switch-exhaustiveness-check` keeps complete.
- Money is an integer count of minor units, or `bigint`. Never a fractional `number`.
- Timestamps arrive as arguments, in UTC.
- Functions take values and return new values. A function that decides on a side effect returns a description of it for the shell to carry out.
- Expected domain failures throw a subclass of one `DomainError` in `core/errors.ts`.
- Input is parsed into domain types at the boundary by hand-written parsers, tested with fast-check. A validation library needs a reason in the project spec.

## Browser modules

With no bundler, the browser resolves imports itself.

- Relative imports work as they are: `tsc` emits `.js` files with `.js` import paths.
- Bare imports, such as a shared workspace package or a runtime dependency, are mapped by an import map in the page's HTML:

```html
<script type="importmap">
  {
    "imports": {
      "@music/format": "/dist/format/index.js",
      "sqlite-wasm": "/vendor/sqlite-wasm/index.mjs"
    }
  }
</script>
```

- Shared workspace packages used in the browser are compiled into `dist/` by `tsconfig.browser.json`, which includes their source.
- Runtime dependencies are copied from `node_modules` into `vendor/` by a committed script, so the page serves exactly the locked version. A dependency must ship ES modules to be usable this way.
- A test fails if any bare specifier in `dist/` has no entry in the import map, or an entry points at a missing file.

## Configuration and secrets

`src/config.ts` implements the configuration rules in `project-types/service.md` and returns a frozen settings object. Secret values are wrapped in a `Secret` class whose `toString`, `toJSON`, and `[Symbol.for("nodejs.util.inspect.custom")]` all return `***`. Code calls `.reveal()` only at the point of use.

## External services

These implement the rules in `core.md`.

- Clients live in `src/shell/clients/` and use the built-in `fetch`.
- Every request passes an `AbortSignal.timeout(...)`. Retries are bounded and written in the project.
- Clients are tested by injecting a recorded response from `tests/fixtures/<service>/`.

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

**No network in the test suite.** Unlike pytest-socket in the Python stack, nothing here blocks the network at the socket level. The block is layered instead:

- `tests/setup.ts` replaces these with functions that throw: `globalThis.fetch` and `WebSocket`; `request` and `get` in `node:http` and `node:https`; `connect` and `createConnection` in `node:net`; and `connect` in `node:tls`. It then calls `syncBuiltinESMExports()` from `node:module`, so modules that use named imports, such as `import { request } from "node:http"`, see the stubs too. Browser-mode tests get a setup file that replaces `fetch` and `WebSocket` the same way.
- Lint bans importing `node:http`, `node:https`, `node:net`, and `node:tls` in test files, except under `tests/smoke/`.
- Code under test reaches the network only through injected clients, so a test that forgets to inject one fails on the stub.

## Logging

A small `log` module in the shell writes the JSON-line format from `project-types/service.md` to stdout through `console.log`. No logging library.

## Shutdown

Node running as PID 1 in a container ignores SIGTERM unless the code handles it. `service.md` requires a clean shutdown, so `main.ts` installs a handler. `server.close()` waits for in-flight responses, and a long download can outlast the container's stop timeout, so a fallback timer forces the shutdown and makes it visible:

```ts
process.on("SIGTERM", () => {
  const force = setTimeout(() => {
    log.warn("shutdown.forced");
    server.closeAllConnections();
    process.exit(1);
  }, 5_000);
  force.unref();
  server.close(() => {
    db.close();
    process.exit(0);
  });
});
```

Keep the fallback shorter than the stop timeout the runner uses. A smoke test stops the running container and fails unless it exits within a few seconds.

## Container image

This implements the container contract in `project-types/service.md`. The image runs TypeScript directly, so there is no build stage for Node code.

**A single project:**

```dockerfile
FROM node:26-slim@sha256:<digest>
RUN npm install -g npm@<exact 12.x>
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

**A project in a workspace** is built from the repo root, so the image gets the root lockfile and the shared packages it depends on:

```dockerfile
FROM node:26-slim@sha256:<digest>
RUN npm install -g npm@<exact 12.x>
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data
COPY package.json package-lock.json .npmrc ./
COPY <shared>/package.json ./<shared>/
COPY <project>/package.json ./<project>/
RUN npm ci --omit=dev -w <project>
COPY <shared>/src ./<shared>/src
COPY <project>/src ./<project>/src
RUN mkdir /data && chown node:node /data
USER node
WORKDIR /app/<project>
EXPOSE 8000
HEALTHCHECK CMD ["node", "-e", "fetch('http://127.0.0.1:8000/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "src/main.ts"]
```

- The image uses the built-in non-root `node` user.
- `.dockerignore` also excludes `node_modules` and `dist`.
- Node does not strip types inside `node_modules`. Workspace packages are linked into `node_modules` as symlinks, which Node resolves to their real path outside it, so shared TypeScript code runs in both development and the image. Confirm this at project setup, and keep the shared package's source outside `node_modules`.

## Documentation

- **API docs.** `docs/openapi.yaml`, covering the API routes only. A test in `tests/docs/` compares every route the server registers with the spec, and fails on anything missing or extra.
- **CLI docs.** Generated by `npm run docs`.

## Pre-commit hooks

These are added to the betterleaks hook from `core.md`. They run the project's own npm scripts, so tool versions come from `package-lock.json` and match CI exactly. Never use `npx` for these: it downloads a package that isn't installed locally.

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
        entry: npm run --silent format:check --
        language: system
        types_or: [ts, javascript, json, yaml, markdown, css, html]
      - id: tsc
        name: tsc
        entry: npm run --silent typecheck
        language: system
        pass_filenames: false
```

- **CI.** CI installs the pinned npm, runs `npm ci`, then `pre-commit run --all-files`.

## Required checks

A single `npm run check` script runs the first four. None of them need the network. The change report lists the result of each check that ran.

| Check | Command | When |
| --- | --- | --- |
| Lint | `npm run lint` | Every change |
| Format | `npm run format:check` | Every change |
| Types | `npm run typecheck` (`tsc` on each of the three configs) | Every change |
| Tests | `npm test` (Vitest, Node and browser) | Every change |
| Mutation | `npm run mutate` (Stryker) | Any change under `src/core/` |
| Audit | `npm audit --audit-level=high` | Every change, in CI |
| Secrets | betterleaks hook, then a scan of the PR's commits in CI | Every commit |
| End-to-end | `npm run e2e` (Playwright) | Browser apps, every change |
| Image | `docker build`, then the smoke tests against the running container | Services, every change, in CI |
