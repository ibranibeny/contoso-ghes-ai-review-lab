#!/usr/bin/env bash
# Step 42 (workstation): collect the demo evidence for the workshop site - the review comments, statuses and the
# reviewer's job log as JSON/text, plus screenshots of the pull request, the checks, the run and the settings.
# Everything lands in /opt/lab/shots; publish with: bash lib/publish-media.sh shots
# Usage: bash 42-demo-collect.sh before   (after step 40: the first review, failing status)
#        bash 42-demo-collect.sh after    (after step 41: the second review, green status)
source ./00-variables.sh >/dev/null
PHASE=${1:-before}
O=$GHES_ORG; R=contoso-orders-api; OUT=/opt/lab/shots; mkdir -p "$OUT"
PR=$(ghes_api GET "/repos/$O/$R/pulls?state=all&head=$O:feature/discount-codes" | jq -r '.[0].number')
echo "--- pull request #$PR"
ghes_api GET "/repos/$O/$R/pulls/$PR" > /tmp/pr.json
ghes_api GET "/repos/$O/$R/pulls/$PR/reviews" > /tmp/reviews.json
ghes_api GET "/repos/$O/$R/pulls/$PR/comments?per_page=100" > /tmp/comments.json
ghes_api GET "/repos/$O/$R/pulls/$PR/commits" > /tmp/commits.json
ghes_api GET "/repos/$O/$R/actions/runs?event=pull_request_target&per_page=10" > /tmp/runs.json
jq -n --slurpfile pr /tmp/pr.json --slurpfile rv /tmp/reviews.json --slurpfile cm /tmp/comments.json \
      --slurpfile cs /tmp/commits.json --slurpfile rn /tmp/runs.json '{
  pr: ($pr[0] | {number, title, state, body, html_url, head: .head.ref, base: .base.ref, additions, deletions, changed_files}),
  commits: [$cs[0][] | {sha: .sha[0:7], message: .commit.message}],
  reviews: [$rv[0][] | {id, user: .user.login, state, commit: .commit_id[0:7], submitted_at, body}],
  comments: [$cm[0][] | {path, line, commit: .original_commit_id[0:7], body}],
  runs: [$rn[0].workflow_runs[] | {id, name, head_sha: .head_sha[0:7], status, conclusion, created_at, updated_at, html_url}]
}' > "$OUT/demo-result.json"
for sha in $(jq -r '.commits[].sha' "$OUT/demo-result.json"); do
  FULL=$(jq -r --arg s "$sha" '.[] | select(.sha | startswith($s)) | .sha' /tmp/commits.json)
  ghes_api GET "/repos/$O/$R/commits/$FULL/status" | jq -c --arg s "$sha" '{sha: $s, state, statuses: [.statuses[] | {context, state, description}]}'
done | jq -s '.' > "$OUT/demo-statuses.json"
cat "$OUT/demo-statuses.json" | jq -c '.[]'
echo "--- reviewer job logs"
: > "$OUT/demo-joblog.txt"
for run in $(jq -r '.runs[] | select(.name=="AI review") | .id' "$OUT/demo-result.json" | sort -n); do
  for job in $(ghes_api GET "/repos/$O/$R/actions/runs/$run/jobs" | jq -r '.jobs[].id'); do
    echo "===== run $run job $job" >> "$OUT/demo-joblog.txt"
    curl -s -L $CA_OPT -H "Authorization: token $(cat "$LAB/ghes-token")" \
      "https://$GHES_HOST/api/v3/repos/$O/$R/actions/jobs/$job/logs" \
      | sed -E 's/^[0-9T:.-]+Z //' | grep -E "\[ai-review|runner|Runner name|Machine name|Job is about|Image:" >> "$OUT/demo-joblog.txt"
  done
done
wc -l "$OUT/demo-joblog.txt"; grep -c "tool " "$OUT/demo-joblog.txt" | sed 's/^/MCP tool calls logged: /'
RUN1=$(jq -r '[.runs[] | select(.name=="AI review")] | sort_by(.id) | .[0].id' "$OUT/demo-result.json")
JOB1=$(ghes_api GET "/repos/$O/$R/actions/runs/$RUN1/jobs" | jq -r '.jobs[0].id')
echo "--- screenshots ($PHASE)"
if [ "$PHASE" = after ]; then
  RUN2=$(jq -r '[.runs[] | select(.name=="AI review")] | sort_by(.id) | .[-1].id' "$OUT/demo-result.json")
  /opt/lab/venv/bin/python lib/shots.py \
    "41-01-pr-after-fix=/$O/$R/pull/$PR#full" \
    "41-01-pr-after-fix-review2=/$O/$R/pull/$PR~last:AI review · Microsoft Foundry~300" \
    "41-01-pr-after-fix-mergebox=/$O/$R/pull/$PR~Review required;approving review;Merging is blocked~150" \
    "41-02-checks-green=/$O/$R/pull/$PR/checks" \
    "41-03-actions-runs=/$O/$R/actions" \
    "41-04-second-run=/$O/$R/actions/runs/$RUN2"
  ls -la "$OUT"; exit 0
fi
/opt/lab/venv/bin/python lib/shots.py \
  "40-03-pr-conversation=/$O/$R/pull/$PR#full" \
  "40-03-pr-conversation-summary=/$O/$R/pull/$PR~AI review · Microsoft Foundry~300" \
  "40-03-pr-conversation-mergebox=/$O/$R/pull/$PR~Merging is blocked;Review required;failing check~150" \
  "40-04-files-inline-inline=/$O/$R/pull/$PR~CSG-SQL-01~320" \
  "40-04-files-inline-injection=/$O/$R/pull/$PR~CSG-INJ-05~320" \
  "40-04-files-inline-secret=/$O/$R/pull/$PR~CSG-SEC-02~320" \
  "40-04-files-inline=/$O/$R/pull/$PR/files#full" \
  "40-05-checks=/$O/$R/pull/$PR/checks" \
  "40-06-actions-run=/$O/$R/actions/runs/$RUN1" \
  "40-07-job-log=/$O/$R/actions/runs/$RUN1/job/$JOB1#full" \
  "40-08-commits=/$O/$R/pull/$PR/commits" \
  "13-01-branch-rules=/$O/$R/settings/branches" \
  "13-02-org-variables=/organizations/$O/settings/variables/actions" \
  "21-01-org-runners=/organizations/$O/settings/actions/runners" \
  "13-03-repo-home=/$O/$R"
ls -la "$OUT"
