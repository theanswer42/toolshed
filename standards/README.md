# Standards

How coding and reviewing agents build and review projects. Start with `core.md`. It applies to every project. Each project's `PROJECT_SPEC.md` names the other documents that apply, in an Applies section, for example:

```text
core, project-types/service, topics/sqlite, stacks/python
```

The project spec records any deviation from these documents, with its reason.

| Document | Covers |
| --- | --- |
| [`core.md`](core.md) | Principles, agent roles, the change report, documentation, external services, pre-commit and secret scanning, and starting a new project |
| [`project-types/service.md`](project-types/service.md) | A containerized server: the container contract, ports, network tiers, configuration and secrets, logging, request safety |
| [`topics/sqlite.md`](topics/sqlite.md) | SQLite schema, repositories, transactions, migrations, and their tests |
| [`stacks/python.md`](stacks/python.md) | Python defaults: uv, ruff, ty, pytest and Hypothesis, mutmut, import-linter, Flask, the container image |
| [`stacks/shell.md`](stacks/shell.md) | Shell defaults: bash, shellcheck, shfmt, `verify` and mutation scripts |
| [`stacks/typescript.md`](stacks/typescript.md) | TypeScript defaults for Node and the browser: npm, `tsc`, ESLint, Prettier, Vitest and fast-check, StrykerJS, no bundler, strict dependency rules |

## Planned

Tracked in #11:

- `project-types/browser-app.md`, `project-types/local-tool.md`, `project-types/library.md`
- `topics/data-formats.md`
- SQLite databases that are built offline and shipped as files, a stateless server, and monorepos with one project spec per project

## Out of scope for now

- **Authentication.** It is being worked out in the music library project first, as a project-specific design. Until it is written up here, an agent stops and asks before building anything reachable from other machines.
- **Background work**, such as schedulers, polling loops, and long-running workers. An agent stops and asks before building one.
