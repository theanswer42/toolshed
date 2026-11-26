# Stack: shell

Defaults for projects, or parts of projects, written as shell scripts. They apply in addition to `core.md`. They are taken from the sandbox (`sandbox/`), the first project built this way.

Shell suits code where nearly every step calls another program, such as `docker`, `git`, or `gh`. Once a script grows logic worth testing with properties, move that logic to a language with a stack document.

## Default stack

| Concern | Default | Notes |
| --- | --- | --- |
| Shell | bash | Scripts start with `#!/usr/bin/env bash` and `set -euo pipefail` |
| Lint | shellcheck | Through pre-commit, pinned |
| Format | shfmt | Through pre-commit, pinned, in check mode (`--diff`) so it never rewrites files |
| Properties | A `verify` script | Runs assertions against the real system, one or more per invariant |
| Mutation testing | A `tests/mutate` script | Removes one protection at a time in a copy, and passes only if `verify` fails the expected invariant |

## Conventions

- Each script's header comment says what it does and names the T1 invariants it touches.
- Secrets never appear in command-line arguments or output, and stay out of environment variables wherever the program using them allows it. Pass them through files with restrictive modes, such as curl's `-K` config files.
- Parse JSON with `jq`, using filter files that `verify` can test against fixtures.
- Exit codes are documented. Interface docs for a command are generated from its `--help` output.

## Pre-commit hooks

These are added to the betterleaks hook from `core.md`.

```yaml
repos:
  - repo: https://github.com/shellcheck-py/shellcheck-py
    rev: <exact tag>
    hooks:
      - id: shellcheck
  - repo: https://github.com/scop/pre-commit-shfmt
    rev: <exact tag>
    hooks:
      - id: shfmt
        args: [--diff]
```
