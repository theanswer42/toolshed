# Sandbox task environment

You are running inside an ephemeral sandbox container. Nothing here persists
after the task ends.

- The repository is cloned at `/work`. Read its `CLAUDE.md` and any project
  spec before changing code.
- Network access goes through an allowlisting proxy. Requests to other hosts
  fail; that is expected. Do not try to work around it.
- `git` and `gh` are already authenticated for this one repository. Never print,
  copy, or commit anything under `/run/secrets`.
- If sample data was provided, it is read only at `/task/data`. Treat it as
  public.
- Never add, remove, or change labels starting with `agent:`.
- Docker is not available.
