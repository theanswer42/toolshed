# `task` command line

Generated from `task --help` by `docs/generate-cli`. Do not edit by hand.

```text
Usage: task <owner/repo> --role implementer|reviewer [--data <dir>] [--keep]

Start an ephemeral task container with <owner/repo> cloned at /work on its
default branch, and open a shell in it.

Options:
  --role ROLE   implementer or reviewer. Chooses the GitHub App, and so the
                token's identity and permissions.
  --data DIR    Copy DIR into a read-only volume mounted at /task/data.
                Everything in DIR is treated as public (INV-19).
  --keep        On exit, stop the container and keep its volumes instead of
                removing them.
  -h, --help    Show this help.

Configuration: ${SANDBOX_CONFIG:-~/.config/sandbox/config}, with
  IMPLEMENTER_APP_ID, REVIEWER_APP_ID, GITHUB_USER, and optionally
  SECRETS_DIR, SANDBOX_CPUS, SANDBOX_MEMORY, SANDBOX_PIDS.
Secrets in SECRETS_DIR (default ~/.config/sandbox/secrets), each owned by
you and not readable by group or others:
  implementer_app_key, reviewer_app_key, claude_token

Exit codes:
  64    bad arguments, bad configuration or secrets, a repo that fails
        preflight, or any failure before the shell starts
  other the exit status of the shell
```
