# INV-9 preflight. Input: the response of
#   GET /repos/{owner}/{repo}/rulesets/{ruleset_id}
# requested with the task's own token. Output: true only if that token's App
# can never bypass the ruleset. A missing field counts as a bypass (fail closed).
# Used by `task`; tested by `verify` against tests/fixtures/ruleset-*.json.
.current_user_can_bypass == "never"
