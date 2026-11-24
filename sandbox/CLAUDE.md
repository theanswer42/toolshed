# sandbox

Read `../python/working-with-agents.md` (Part 1; Part 2 does not apply, see the spec's Deviations) and `PROJECT_SPEC.md` before changing anything. `README.md` explains how the pieces fit.

## Commands

- Build images: `docker compose -f sandbox/compose.yaml --profile task build`
- Offline checks: `sandbox/verify`
- Checks with real tokens: `sandbox/verify --online <owner/repo>` (needs the user's config and secrets)
- Show each check fails without its protection: `sandbox/tests/mutate [--online <owner/repo>]`
- Lint: `pre-commit run --all-files` (shellcheck, shfmt, betterleaks)
- After changing `task --help`: `sandbox/docs/generate-cli`

## Notes

- Docker on the user's machine is rootless. Bind-mounted host files show up as root-owned inside containers.
- Never read, print, or copy anything in `~/.config/sandbox/secrets`. `task` and `verify` read it; you don't need to.
- Tasks are tracked as GitHub issues. Scratchpad files go in `agent-scratchpad/<issue>-<slug>.md`.
- Every change ends with the change report from principle 13, as the PR description.
