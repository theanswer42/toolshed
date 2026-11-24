# INV-9 preflight. Input: the response of
#   GET /repos/{owner}/{repo}/rules/branches/{default_branch}
# Output: the required rules that are missing, comma-separated, or "" if none.
# Used by `task`; tested by `verify` against tests/fixtures/rules-*.json.
def has_rule(t): any(.[]; .type == t);
def pr: [.[] | select(.type == "pull_request") | .parameters];
[ (if has_rule("deletion") then empty else "deletion" end),
  (if has_rule("non_fast_forward") then empty else "non_fast_forward" end),
  (if any(pr[]; .required_approving_review_count >= 1) then empty else "pull_request: required approvals >= 1" end),
  (if any(pr[]; .require_code_owner_review == true) then empty else "pull_request: code-owner review" end),
  (if any(pr[]; .dismiss_stale_reviews_on_push == true) then empty else "pull_request: dismiss stale approvals" end),
  (if any(pr[]; .require_last_push_approval == true) then empty else "pull_request: last-push approval" end)
] | join(", ")
